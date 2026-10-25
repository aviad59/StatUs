import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TickEvent } from '@status/shared';
import { and, count, desc, eq, gt, ne, sql } from 'drizzle-orm';
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
import { StorageService } from '../storage/storage.service';
import { directionFor } from './story.service';

type Account = typeof accounts.$inferSelect;
type Character = typeof characters.$inferSelect & { account: Account };

export interface FeedPost {
  id: string;
  author: Account;
  caption: string;
  /**
   * What the photo shows: a vision model's description for the user's uploads (see
   * FeedService.createPost), the English image prompt for generated agent photos.
   */
  imageDescription: string | null;
  createdAt: Date;
  comments: { author: Account; text: string }[];
}

/** Everything a tick loads once and shares between agent turns. */
export interface TickContext {
  worldId: string;
  tick: number;
  player: Account;
  accountsById: Map<string, Account>;
  /**
   * Newest first. Comments are appended as turns run, so later agents see them; new
   * posts are saved in the background and only join the feed on the next tick.
   */
  feed: FeedPost[];
  activeBeat: typeof storyBeats.$inferSelect | null;
  flags: Record<string, unknown>;
}

type SpontaneousAction = 'post' | 'comment' | 'comment_on_player_post' | 'message_player' | 'nothing';
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
  /** What the active story beat needs from this character, if anything (see StoryService). */
  direction: string | null;
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

// Models default to a mini-essay with a punchline or a life lesson; real captions are
// mostly a few words.
const POST_TASK = `המשימה: לכתוב כיתוב לפוסט חדש שמתפרסם עכשיו.
- כמו כיתוב אמיתי באינסטגרם: לרוב קצר מאוד, מכמה מילים ועד משפט אחד. לפעמים רק מילה ואימוג׳י.
- בלי מוסר השכל, בלי משפט מוטיבציה ובלי פאנץ׳ בסוף. לא להסביר את הבדיחה.
- לא חייב להיות על התחביב או העבודה שלך: גם אוכל, חברים, ים, מצב רוח, סתם יום.
- לא לחזור על נושא של פוסט שכבר פרסמת.
- בלי האשטגים.
רק הכיתוב, בלי מירכאות.`;

// Left alone, models write DMs as paragraphs of polished one-liners, quote the other
// person back to them and keep reusing the same joke.
const DM_TASK = `המשימה: לכתוב את ההודעה הבאה שלך בשיחה, כמו בוואטסאפ.
- קצרה: לרוב 3 עד 12 מילים, משפט אחד. לפעמים שני משפטים קצרים. אנשים לא כותבים פסקאות בוואטסאפ.
- לענות למה שנכתב אחרון, ישר לעניין. אם שאלו משהו, לענות על זה. אם כבר ענו לך, להתקדם ולא לשאול שוב.
- לא לצטט את מה שהצד השני כתב, ולא לחזור על בדיחה, ביטוי או דימוי שכבר היו בשיחה או במה שכתבת קודם.
- בלי שנינויות מתוחכמות ובלי דימויים. הומור, אם יש, פשוט ("חחח", "די נו").
- לא חייבים לסיים בשאלה.
- רוב הזמן הודעה אחת. כשיש יותר להגיד, לפצל ל-2 או 3 הודעות קצרות ברצף, כל אחת בשורה נפרדת.
רק ההודעות, בלי מירכאות.`;
const DM_MAX_PARTS = 3;

// The character picks the photo. Faces aren't consistent between images yet, so
// people stay out of focus.
const PHOTO_TASK = `Task: describe the photo you are posting with this caption, as a prompt for an image generator. Write it in English.
- 3 to 4 sentences, under 80 words (the image model ignores the rest): what is in the frame, where, the light and the mood. Concrete and visual.
- An ordinary photo a person in Israel would take with their phone, matching your life and the caption.
- If people appear, show them from behind, from a distance, or only their hands. No close-up faces.
- No text, signs or logos in the image.
Only the description, nothing else.`;
const PHOTO_STYLE =
  'Candid smartphone photo, natural light, realistic, slightly imperfect framing, Instagram post, square.';

// Real Instagram comments are a quick reaction, not a review of the photo. Without
// this, models recite the photo description and squeeze in the persona's hobby.
const COMMENT_TASK = `המשימה: לכתוב תגובה לפוסט הזה, כמו תגובה אמיתית של חבר באינסטגרם.
- קצרה מאוד: 2 עד 8 מילים. תגובה ותחושה, לא תיאור.
- לא לפרט מה רואים בתמונה. התיאור שלה נועד רק כדי להבין על מה הפוסט; לכל היותר להזכיר פרט אחד, ורק אם הוא באמת בולט.
- לא משחקי מילים ולא בדיחות על התחביב או העבודה שלך, אלא אם הפוסט באמת קשור לזה.
- לא לחזור על מה שאחרים כבר כתבו בתגובות, גם לא באותו רעיון.
דוגמאות לטון (לפי הקול שלך, ראו למעלה): "וואו איזה כיף", "איפה זה??", "חחח אתם לא נורמליים", "איזו תמונה"
רק התגובה, בלי מירכאות.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Decides what a character does this tick. Plans for all characters run in
   * parallel against the same snapshot; act() then carries them out in order.
   */
  async plan(ctx: TickContext, character: Character): Promise<TurnPlan> {
    const [memoryRows, rels, dm, postsSinceMine] = await Promise.all([
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
      this.postsSinceLastPost(ctx.worldId, character.accountId),
    ]);

    const me = character.account;
    const history = (dm?.messages ?? []).toReversed().map((m) => ({
      from: m.senderId === me.id ? me.username : ctx.player.username,
      text: m.text,
    }));
    const memories = memoryRows.map((m) => m.content);
    const repliedPost = unansweredPlayerComment(ctx, me);
    const direction = directionFor(ctx.activeBeat, me.username);
    const base = { character, memories, dm: { id: dm?.id, history }, repliedPost, direction };

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
      story: { yourPartRightNow: direction ?? undefined, flags: ctx.flags },
      feed: feed.map((p) => ({
        author: p.author.username,
        caption: p.caption,
        photo: p.imageDescription ?? undefined,
        minutesAgo: Math.round((Date.now() - p.createdAt.getTime()) / 60_000),
        latestComments: p.comments.slice(-COMMENTS_PER_POST).map((c) => `${c.author.username}: ${c.text}`),
      })),
      dmWithPlayer: history,
    };

    const options: Partial<Record<SpontaneousAction, string>> = {
      post: `Publish a new post about your life (${sinceLastPost(postsSinceMine)})`,
      comment: "Comment on a friend's post in the feed (friends here comment on each other's posts a lot)",
      nothing: 'Do nothing this time',
    };
    // The player posted something this character hasn't reacted to: friends usually do.
    if (newPlayerPost(ctx, me)) {
      options.comment_on_player_post = `Comment on ${ctx.player.username}'s new post (friends usually react to it)`;
    }
    // No double-texting: if the last DM is theirs, they wait for the player to answer.
    if (history.at(-1)?.from !== me.username) {
      options.message_player = `Send ${ctx.player.username} a private message`;
    }
    // decide() only ever returns one of the keys actually passed in.
    const { choice } = await this.ai.decide(state, {
      type: 'choice',
      instructions: direction
        ? `You are ${me.username}. The story needs this from you now: "${direction}". Pick the action that does it.`
        : `You are ${me.username}. What do you do right now? Posting is the main thing people do here: ` +
          'post often, and almost certainly if several others have posted since your last post. ' +
          'Pick "nothing" only if you have no reason to act.',
      options: options as Record<SpontaneousAction, string>,
    });
    return { ...base, action: choice, forced: false, state };
  }

  /** Posts by others since this character's last post; null if it has never posted. */
  private async postsSinceLastPost(worldId: string, accountId: string): Promise<number | null> {
    const last = await this.db.query.posts.findFirst({
      where: and(eq(posts.worldId, worldId), eq(posts.authorId, accountId)),
      orderBy: desc(posts.createdAt),
      columns: { createdAt: true },
    });
    if (!last) return null;
    const [row] = await this.db
      .select({ n: count() })
      .from(posts)
      .where(and(eq(posts.worldId, worldId), ne(posts.authorId, accountId), gt(posts.createdAt, last.createdAt)));
    return row.n;
  }

  /** Carries out a plan. Returns what happened, or null if nothing did. */
  async act(ctx: TickContext, plan: TurnPlan): Promise<TickEvent | null> {
    const system = this.systemPrompt(ctx, plan.character, plan.memories);
    switch (plan.action) {
      case 'post':
        return this.post(ctx, plan.character, system);
      case 'comment':
        return this.comment(ctx, plan, system);
      case 'comment_on_player_post':
        return this.commentOnPlayerPost(ctx, plan, system);
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
    // Only this character's own part: the beat description may hold others' secrets.
    const direction = directionFor(ctx.activeBeat, character.account.username);
    if (direction) {
      lines.push(
        '',
        `מה שקורה איתך עכשיו: ${direction}`,
        'לעשות את זה בדרך שלך ובטבעיות. אם זה כבר נאמר או קרה בשיחה, לא לחזור על זה אלא להמשיך מאיפה שהשיחה נמצאת.',
      );
    }
    return lines.join('\n');
  }

  /**
   * Writes the caption now; the photo is drawn and the post saved in the background
   * (publish), so the tick doesn't wait for image generation. The post appears in the
   * feed a few seconds after the tick, so other agents only see it from the next tick.
   */
  private async post(ctx: TickContext, character: Character, system: string): Promise<TickEvent> {
    const caption = clean(
      await this.ai.generate(
        POST_TASK,
        { system, ...SHORT_TEXT, maxTokens: 300 },
      ),
    );
    const postId = randomUUID();
    void this.publish(ctx, character, system, postId, caption).catch((error: unknown) =>
      this.logger.warn(`Could not publish @${character.account.username}'s post: ${String(error)}`),
    );
    await this.remember(character, `פרסמתי פוסט: ${caption}`);
    return { type: 'post', actor: toUser(character.account), postId, text: caption };
  }

  private async publish(ctx: TickContext, character: Character, system: string, id: string, caption: string) {
    const image = await this.postPhoto(ctx, character, system, caption);
    await this.db.insert(posts).values({
      id,
      worldId: ctx.worldId,
      authorId: character.accountId,
      imageUrl: image.url,
      imageDescription: image.description,
      caption,
      likeCount: 5 + Math.floor(Math.random() * 80),
    });
  }

  /**
   * The photo for a new post: the character describes it (in English, which image
   * models follow best) and the image provider draws it, with one retry. If that
   * fails too, it throws and the post is dropped: an unrelated photo looks worse.
   * Without an image provider, the post gets a random placeholder photo.
   */
  private async postPhoto(ctx: TickContext, character: Character, system: string, caption: string) {
    if (this.ai.providers.image === 'none') {
      return { url: photo(`${character.account.username}-${ctx.tick}-${Date.now()}`), description: null };
    }
    const description = clean(
      await this.ai.generate(`${PHOTO_TASK}\n\nThe caption: ${caption}`, {
        system,
        hebrew: false,
        temperature: 0.7,
        maxTokens: 300,
      }),
    );
    const draw = () =>
      this.ai.generateImage(`${description}\n\n${PHOTO_STYLE}`) ?? Promise.reject(new Error('No image provider'));
    const jpeg = await draw().catch((error: unknown) => {
      this.logger.warn(`Image generation failed for @${character.account.username}, retrying: ${String(error)}`);
      return draw();
    });
    const path = `${ctx.worldId}/posts/${randomUUID()}.jpg`;
    return { url: await this.storage.upload(path, jpeg, 'image/jpeg'), description };
  }

  private async comment(ctx: TickContext, plan: TurnPlan, system: string): Promise<TickEvent | null> {
    const me = plan.character.account;
    // Read the feed now, not at plan time: earlier turns this tick may have added comments.
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
    return target ? this.commentOn(target, plan, system) : null;
  }

  /** Comments on (and likes) the player's newest post this character hasn't reacted to. */
  private async commentOnPlayerPost(ctx: TickContext, plan: TurnPlan, system: string) {
    const target = newPlayerPost(ctx, plan.character.account);
    if (!target) return null;
    const event = await this.commentOn(target, plan, system);
    if (event) {
      await this.db
        .update(posts)
        .set({ likeCount: sql`${posts.likeCount} + 1` })
        .where(eq(posts.id, target.id));
    }
    return event;
  }

  private async commentOn(target: FeedPost, plan: TurnPlan, system: string): Promise<TickEvent | null> {
    const text = clean(
      await this.ai.generate(
        `${postContext(target)}\n${addressAs(target.author)}\n\n` + COMMENT_TASK,
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
          `${addressAs(ctx.player)}\n\n` +
          DM_TASK,
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
    // Each line is its own message, like a few quick WhatsApp texts in a row. Explicit
    // timestamps a millisecond apart keep them in order (not later: that would leave
    // them unread after the user reads the conversation).
    const texts = text.split('\n').map(clean).filter(Boolean).slice(0, DM_MAX_PARTS);
    const now = Date.now();
    const conversationId = id;
    const [rows] = await Promise.all([
      this.db
        .insert(messages)
        .values(
          texts.map((part, i) => ({
            conversationId,
            senderId: plan.character.accountId,
            text: part,
            createdAt: new Date(now + i),
          })),
        )
        .returning(),
      this.remember(plan.character, `כתבתי ל-${player}: ${texts.join(' ')}`),
    ]);
    return { id, text: texts.join('\n'), row: rows.at(-1)! };
  }

  private async remember(character: Character, content: string) {
    await this.db.insert(characterMemories).values({ characterId: character.id, content, importance: 3 });
  }
}

/** How the character refers to themselves. Hebrew verbs and adjectives agree with gender. */
function selfGender(account: Account): string {
  switch (account.gender) {
    case 'female':
      return [
        'את אישה: לכתוב על עצמך תמיד בלשון נקבה (למשל: "אני עייפה", "הייתי בטוחה", "אני מתה על זה").',
        'לכתוב כמו בחורה ישראלית ברשתות, בסגנון שלך לפי האופי שלך: חמה וישירה. ' +
          'מילים שבחורות משתמשות בהן (מאגר לבחירה, לא תבנית: לא להעתיק ולא לפתוח כל פעם באותה מילה): ' +
          'וואי, כפרה, מושלם, מתה, אוהבת, יפים, חמודים, איזה כיף, אותיות שחוזרות ("וואייי"), ❤️ 😍 🥹 😂.',
        'בלי סלנג של בנים: לא "אחי", "אש עליכם", "חזק על זה", "על הכיפאק", "מכונות", "אלופים", "תותח".',
      ].join('\n');
    case 'male':
      return [
        'אתה גבר: לכתוב על עצמך תמיד בלשון זכר (למשל: "אני עייף", "הייתי בטוח", "אני מת על זה").',
        'לכתוב כמו בחור ישראלי ברשתות, בסגנון שלך לפי האופי שלך: קצר ויבש יותר. ' +
          'מילים שבחורים משתמשים בהן (מאגר לבחירה, לא תבנית: לא להעתיק ולא לפתוח כל פעם באותה מילה): ' +
          'אחי, אש, חזק, תותח, מלך, יאללה, 🔥 💪 😂. בדיחה רק אם היא באמת מצחיקה ופשוטה.',
      ].join('\n');
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

/** The player's newest post in the feed that this character hasn't commented on yet. */
function newPlayerPost(ctx: TickContext, character: Account): FeedPost | undefined {
  return ctx.feed
    .slice(0, FEED_IN_STATE)
    .find((p) => p.author.id === ctx.player.id && !p.comments.some((c) => c.author.id === character.id));
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

function sinceLastPost(postsByOthers: number | null) {
  if (postsByOthers === null) return "you haven't posted yet";
  return `${postsByOthers} posts by others since your last post`;
}

function postContext(post: FeedPost) {
  const thread = post.comments
    .slice(-COMMENTS_PER_POST)
    .map((c) => `@${c.author.username}: ${c.text}`)
    .join('\n');
  return (
    `פוסט של @${post.author.username}: ${post.caption}` +
    (post.imageDescription ? `\nמה רואים בתמונה: ${post.imageDescription}` : '') +
    (thread ? `\nתגובות אחרונות:\n${thread}` : '')
  );
}

/** Strips model artifacts: leftover <think> blocks and wrapping quotes. */
function clean(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .replace(/^["'״“”]+|["'״“”]+$/g, '')
    .trim();
}
