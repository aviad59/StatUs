import { Inject, Injectable } from '@nestjs/common';
import type { TickEvent } from '@status/shared';
import { and, desc, eq } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import { AiService } from '../ai/ai.service';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import {
  characterMemories,
  characters,
  comments,
  conversations,
  messages,
  posts,
  relationships,
  type accounts,
  storyBeats,
} from '../db/schema';

type Account = typeof accounts.$inferSelect;
type Character = typeof characters.$inferSelect & { account: Account };

export interface FeedPost {
  id: string;
  author: Account;
  caption: string;
  createdAt: Date;
  comments: { author: Account; text: string }[];
}

/** Everything a tick loads once and shares between agent turns. */
export interface TickContext {
  worldId: string;
  tick: number;
  player: Account;
  accountsById: Map<string, Account>;
  /** Newest first. Turns append to it, so later agents see earlier agents' actions. */
  feed: FeedPost[];
  activeBeat: typeof storyBeats.$inferSelect | null;
  flags: Record<string, unknown>;
}

type SpontaneousAction = 'post' | 'comment' | 'message_player' | 'nothing';
type Action = SpontaneousAction | 'reply_to_player_comment';

/** What one character will do this tick, decided before anyone acts. */
export interface TurnPlan {
  character: Character;
  action: Action;
  /**
   * True when the player is waiting on this character (an unanswered DM or comment).
   * Forced turns always run, before the spontaneous ones.
   */
  forced: boolean;
  memories: string[];
  dm: { id: string | undefined; history: { from: string; text: string }[] };
  /** The character's post the player commented on, for reply_to_player_comment. */
  repliedPost: FeedPost | undefined;
  state: object;
}

const FEED_IN_STATE = 8;
const COMMENTS_PER_POST = 3;
const MEMORIES_IN_STATE = 8;
const DM_HISTORY = 8;

const photo = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

// Lower than the usual default (~0.8): small models produce broken Hebrew (dropped
// letters, made-up words) noticeably more often at high temperature.
const SHORT_TEXT = { temperature: 0.6, maxTokens: 200 };

@Injectable()
export class AgentService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
  ) {}

  /**
   * Decides what a character does this tick. Plans for all characters run in
   * parallel against the same snapshot; act() then carries them out in order.
   */
  async plan(ctx: TickContext, character: Character): Promise<TurnPlan> {
    const [memoryRows, rels, dm] = await Promise.all([
      this.db.query.characterMemories.findMany({
        where: eq(characterMemories.characterId, character.id),
        orderBy: desc(characterMemories.createdAt),
        limit: MEMORIES_IN_STATE,
      }),
      this.db.query.relationships.findMany({
        where: eq(relationships.characterId, character.id),
      }),
      this.db.query.conversations.findFirst({
        where: and(eq(conversations.worldId, ctx.worldId), eq(conversations.agentId, character.accountId)),
        with: { messages: { orderBy: desc(messages.createdAt), limit: DM_HISTORY } },
      }),
    ]);

    const me = character.account;
    const history = (dm?.messages ?? []).toReversed().map((m) => ({
      from: m.senderId === me.id ? me.username : ctx.player.username,
      text: m.text,
    }));
    const memories = memoryRows.map((m) => m.content);
    const repliedPost = unansweredPlayerComment(ctx, me);
    const base = { character, memories, dm: { id: dm?.id, history }, repliedPost };

    // The player is waiting: people answer DMs and comments on their own posts.
    if (history.at(-1)?.from === ctx.player.username) {
      return { ...base, action: 'message_player', forced: true, state: {} };
    }
    if (repliedPost) {
      return { ...base, action: 'reply_to_player_comment', forced: true, state: {} };
    }

    const feed = ctx.feed.slice(0, FEED_IN_STATE);
    const state = {
      you: { username: me.username, name: me.name, persona: character.persona, secrets: character.secrets },
      player: { username: ctx.player.username, note: 'The one real human in this world.' },
      memories,
      relationships: rels.map((r) => ({
        username: ctx.accountsById.get(r.targetAccountId)?.username,
        score: r.score,
        scale: '-100 hostile .. 100 devoted',
      })),
      story: {
        activeBeat: ctx.activeBeat && {
          title: ctx.activeBeat.title,
          description: ctx.activeBeat.description,
        },
        flags: ctx.flags,
      },
      feed: feed.map((p) => ({
        author: p.author.username,
        caption: p.caption,
        minutesAgo: Math.round((Date.now() - p.createdAt.getTime()) / 60_000),
        latestComments: p.comments.slice(-COMMENTS_PER_POST).map((c) => `${c.author.username}: ${c.text}`),
      })),
      dmWithPlayer: history,
    };

    const options: Partial<Record<SpontaneousAction, string>> = {
      post: 'Publish a new post about your life',
      comment: 'Comment on one of the posts in the feed',
      nothing: 'Do nothing this time',
    };
    // No double-texting: if the last DM is theirs, they wait for the player to answer.
    if (history.at(-1)?.from !== me.username) {
      options.message_player = `Send ${ctx.player.username} a private message`;
    }
    // decide() only ever returns one of the keys actually passed in.
    const { choice } = await this.ai.decide(state, {
      type: 'choice',
      instructions:
        `You are ${me.username}. What do you do right now? Real people mostly scroll without posting, ` +
        'so pick "nothing" unless something in your life, the story or the feed gives you a reason.',
      options: options as Record<SpontaneousAction, string>,
    });
    return { ...base, action: choice, forced: false, state };
  }

  /** Carries out a plan. Returns what happened, or null if nothing did. */
  async act(ctx: TickContext, plan: TurnPlan): Promise<TickEvent | null> {
    const system = this.systemPrompt(ctx, plan.character, plan.memories);
    switch (plan.action) {
      case 'post':
        return this.post(ctx, plan.character, system);
      case 'comment':
        return this.comment(ctx, plan, system);
      case 'reply_to_player_comment':
        return plan.repliedPost ? this.replyToPlayer(ctx, plan, plan.repliedPost, system) : null;
      case 'message_player':
        return this.messagePlayer(ctx, plan, system);
      case 'nothing':
        return null;
    }
  }

  // Prompts are in Hebrew on purpose: English instructions make the model "think" in
  // English and the Hebrew comes out sounding translated. Task instructions use the
  // infinitive ("לכתוב"); gender is stated explicitly (see selfGender / addressAs).
  private systemPrompt(ctx: Pick<TickContext, 'activeBeat'>, character: Character, memories: string[]) {
    const lines = [
      character.persona,
      '',
      `שם המשתמש שלך הוא @${character.account.username} ברשת StatUs (רשת כמו אינסטגרם). תמיד להישאר בדמות.`,
      selfGender(character.account),
      'לכתוב משהו חדש בקול שלך. אף פעם לא להעתיק או לחזור על מה שמישהו אחר כתב.',
    ];
    if (character.secrets.length) {
      lines.push(
        '',
        'סודות שלך (לא לחשוף במפורש; לכל היותר לרמוז, ורק אם הסיפור מצדיק):',
        ...character.secrets.map((s) => `- ${s}`),
      );
    }
    if (memories.length) lines.push('', 'דברים שקרו לאחרונה:', ...memories.map((m) => `- ${m}`));
    if (ctx.activeBeat) {
      lines.push(
        '',
        `מה קורה עכשיו בסיפור: ${ctx.activeBeat.title}. ${ctx.activeBeat.description}`,
        'לשלב את זה רק אם זה נוגע לדמות שלך.',
      );
    }
    return lines.join('\n');
  }

  private async post(ctx: TickContext, character: Character, system: string): Promise<TickEvent> {
    const caption = clean(
      await this.ai.generate(
        'המשימה: לכתוב כיתוב לפוסט חדש שמתפרסם עכשיו, על משהו מהחיים שלך. ' +
          'רק הכיתוב עצמו, משפט או שניים. בלי מירכאות.',
        { system, ...SHORT_TEXT, maxTokens: 300 },
      ),
    );
    const [row] = await this.db
      .insert(posts)
      .values({
        worldId: ctx.worldId,
        authorId: character.accountId,
        // Placeholder until agents can generate images.
        imageUrl: photo(`${character.account.username}-${ctx.tick}-${Date.now()}`),
        caption,
        likeCount: 5 + Math.floor(Math.random() * 80),
      })
      .returning();

    ctx.feed.unshift({ id: row.id, author: character.account, caption, createdAt: row.createdAt, comments: [] });
    await this.remember(character, `פרסמתי פוסט: ${caption}`);
    return { type: 'post', actor: toUser(character.account), postId: row.id, text: caption };
  }

  private async comment(ctx: TickContext, plan: TurnPlan, system: string): Promise<TickEvent | null> {
    const me = plan.character.account;
    // Re-read the feed now: earlier turns this tick may have added posts.
    const feed = ctx.feed.slice(0, FEED_IN_STATE).filter((p) => p.author.id !== me.id);
    if (!feed.length) return null;

    const { choice } = await this.ai.decide(plan.state, {
      type: 'choice',
      instructions: `You are ${me.username}. Which post do you comment on?`,
      options: Object.fromEntries(
        feed.map((p, i) => [`p${i}`, `@${p.author.username}: ${p.caption} (${p.comments.length} comments)`]),
      ),
    });
    const target = feed[Number(choice.slice(1))];
    if (!target) return null;

    const text = clean(
      await this.ai.generate(
        `${postContext(target)}\n${addressAs(target.author)}\n\n` +
          'המשימה: לכתוב תגובה לפוסט הזה. רק התגובה, משפט קצר אחד. בלי מירכאות.',
        { system, ...SHORT_TEXT },
      ),
    );
    return this.saveComment(plan.character, target, text);
  }

  private async replyToPlayer(
    ctx: TickContext,
    plan: TurnPlan,
    target: FeedPost,
    system: string,
  ): Promise<TickEvent | null> {
    const player = ctx.player.username;
    const text = clean(
      await this.ai.generate(
        `${postContext(target)}\n${addressAs(ctx.player)}\n\n` +
          `המשימה: לענות לתגובה האחרונה של @${player} על הפוסט שלך, בתגובה קצרה ` +
          `שמתחילה ב-@${player}. רק התגובה, משפט אחד. בלי מירכאות.`,
        { system, ...SHORT_TEXT },
      ),
    );
    return this.saveComment(plan.character, target, text);
  }

  private async saveComment(character: Character, target: FeedPost, text: string): Promise<TickEvent | null> {
    // Small models sometimes parrot an existing comment; drop those rather than post a copy.
    if (!text || target.comments.some((c) => c.text === text) || text === target.caption) return null;

    await Promise.all([
      this.db.insert(comments).values({ postId: target.id, authorId: character.accountId, text }),
      this.remember(character, `הגבתי לפוסט של ${target.author.username}: ${text}`),
    ]);
    target.comments.push({ author: character.account, text });
    return {
      type: 'comment',
      actor: toUser(character.account),
      postId: target.id,
      postAuthor: toUser(target.author),
      text,
    };
  }

  /**
   * Answers the player's DM right away, outside a tick. Returns the saved reply, or
   * null when the last message isn't the player's (nothing to answer).
   */
  async replyInDm(player: Account, conversationId: string) {
    const conversation = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.worldId, player.worldId)),
      with: { messages: { orderBy: desc(messages.createdAt), limit: DM_HISTORY } },
    });
    if (!conversation || conversation.messages[0]?.senderId !== player.id) return null;

    const [character, activeBeat] = await Promise.all([
      this.db.query.characters.findFirst({
        where: eq(characters.accountId, conversation.agentId),
        with: {
          account: true,
          memories: { orderBy: desc(characterMemories.createdAt), limit: MEMORIES_IN_STATE },
        },
      }),
      this.db.query.storyBeats.findFirst({
        where: and(eq(storyBeats.worldId, player.worldId), eq(storyBeats.status, 'active')),
      }),
    ]);
    if (!character) return null;

    const history = conversation.messages.toReversed().map((m) => ({
      from: m.senderId === player.id ? player.username : character.account.username,
      text: m.text,
    }));
    const ctx = { worldId: player.worldId, player, activeBeat: activeBeat ?? null };
    const system = this.systemPrompt(ctx, character, character.memories.map((m) => m.content));
    const { row } = await this.writeDm(ctx, { character, dm: { id: conversation.id, history } }, system);
    return row;
  }

  private async messagePlayer(ctx: TickContext, plan: TurnPlan, system: string): Promise<TickEvent> {
    const { id, text } = await this.writeDm(ctx, plan, system);
    return { type: 'message', actor: toUser(plan.character.account), conversationId: id, text };
  }

  /** Writes the character's next DM to the player and saves it, opening the conversation if needed. */
  private async writeDm(
    ctx: Pick<TickContext, 'worldId' | 'player'>,
    plan: Pick<TurnPlan, 'character' | 'dm'>,
    system: string,
  ) {
    const player = ctx.player.username;
    const transcript = plan.dm.history.map((m) => `@${m.from}: ${m.text}`).join('\n');
    const text = clean(
      await this.ai.generate(
        (transcript
          ? `השיחה הפרטית שלך עם @${player} עד עכשיו:\n${transcript}\n\n`
          : `מתחילים עכשיו שיחה פרטית עם @${player}.\n\n`) +
          `${addressAs(ctx.player)}\n` +
          'המשימה: לכתוב את ההודעה הבאה שלך, כמו בוואטסאפ. רק ההודעה, קצרה. בלי מירכאות.',
        { system, ...SHORT_TEXT },
      ),
    );

    let id = plan.dm.id;
    if (!id) {
      const [row] = await this.db
        .insert(conversations)
        .values({ worldId: ctx.worldId, agentId: plan.character.accountId })
        .returning();
      id = row.id;
    }
    const [[row]] = await Promise.all([
      this.db
        .insert(messages)
        .values({ conversationId: id, senderId: plan.character.accountId, text })
        .returning(),
      this.remember(plan.character, `כתבתי ל-${player}: ${text}`),
    ]);
    return { id, text, row };
  }

  private async remember(character: Character, content: string) {
    await this.db.insert(characterMemories).values({ characterId: character.id, content, importance: 3 });
  }
}

/** How the character refers to themselves. Hebrew verbs and adjectives agree with gender. */
function selfGender(account: Account): string {
  switch (account.gender) {
    case 'female':
      return 'את אישה: לכתוב על עצמך תמיד בלשון נקבה (למשל: "אני עייפה", "הייתי בטוחה", "אני מתה על זה").';
    case 'male':
      return 'אתה גבר: לכתוב על עצמך תמיד בלשון זכר (למשל: "אני עייף", "הייתי בטוח", "אני מת על זה").';
    case null:
      return '';
  }
}

/** How to address (or talk about) another account. */
function addressAs(account: Account): string {
  switch (account.gender) {
    case 'female':
      return `@${account.username} היא אישה: לפנות אליה בלשון נקבה.`;
    case 'male':
      return `@${account.username} הוא גבר: לפנות אליו בלשון זכר.`;
    case null:
      return (
        `לא ידוע אם @${account.username} גבר או אישה: לפנות בלי הטיה מגדרית, ` +
        'למשל בלשון רבים ("מה קורה איתכם?", "באים?") או בניסוח שעוקף את זה. בלי צורות עם לוכסן.'
      );
  }
}

/** The character's most recent post with a player comment they haven't answered yet. */
function unansweredPlayerComment(ctx: TickContext, author: Account): FeedPost | undefined {
  return ctx.feed.find((post) => {
    if (post.author.id !== author.id) return false;
    const lastFromPlayer = post.comments.findLastIndex((c) => c.author.id === ctx.player.id);
    if (lastFromPlayer === -1) return false;
    return !post.comments.slice(lastFromPlayer + 1).some((c) => c.author.id === author.id);
  });
}

function postContext(post: FeedPost) {
  const thread = post.comments
    .slice(-COMMENTS_PER_POST)
    .map((c) => `@${c.author.username}: ${c.text}`)
    .join('\n');
  return `פוסט של @${post.author.username}: ${post.caption}` + (thread ? `\nתגובות אחרונות:\n${thread}` : '');
}

/** Strips model artifacts: leftover <think> blocks and wrapping quotes. */
function clean(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .replace(/^["'״“”]+|["'״“”]+$/g, '')
    .trim();
}
