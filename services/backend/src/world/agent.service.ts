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
  scenes,
  stories,
  type accounts,
  storyBeats,
} from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { directionFor } from './story.service';
import { WorldChanges } from './world-changes';

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
   * Newest first. Turns are written in parallel from this snapshot; comments are
   * appended as they're saved (so parallel copies get dropped), and new posts only
   * join the feed on the next tick.
   */
  feed: FeedPost[];
  activeBeat: typeof storyBeats.$inferSelect | null;
  flags: Record<string, unknown>;
  /** What happened lately off the network (scenes), oldest first, as everyone there knows it. */
  realLife: RealLife[];
  /** The active beat waits for the player's choice in its scene (see beatDone). */
  awaitingChoice: boolean;
}

/** A scene as characters know it: where, what happened (recap), and what the player decided there. */
export interface RealLife {
  place: string;
  recap: string;
  playerChose: string | null;
}

/** Scene rows → what characters know of them. */
export function toRealLife(rows: (typeof scenes.$inferSelect)[], player: Account): RealLife[] {
  return rows.toReversed().map((s) => {
    const chosen = s.choices.find((c) => c.key === s.chosen)?.label;
    const verb = player.gender === 'female' ? 'בחרה' : player.gender === 'male' ? 'בחר' : 'החליטו';
    return { place: s.place, recap: s.recap, playerChose: chosen ? `@${player.username} ${verb}: ${chosen}` : null };
  });
}

/** How many recent scenes characters remember. */
export const REAL_LIFE_IN_PROMPT = 3;

type SpontaneousAction =
  | 'post'
  | 'text_post'
  | 'story'
  | 'comment'
  | 'comment_on_player_post'
  | 'message_player'
  | 'nothing';
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

/**
 * A turn that's been written but not saved yet (AgentService.compose → commit). The
 * AI work happens in compose, so a tick can be composed ahead of time and committed
 * in a moment when the player asks for it.
 */
export type Draft =
  | { kind: 'post'; plan: TurnPlan; system: string; caption: string }
  | { kind: 'text_post'; plan: TurnPlan; caption: string }
  | { kind: 'story'; plan: TurnPlan; system: string; text: string }
  | { kind: 'comment'; plan: TurnPlan; target: FeedPost; text: string; like: boolean }
  | { kind: 'message'; plan: TurnPlan; texts: string[] };

const FEED_IN_STATE = 8;
const COMMENTS_PER_POST = 3;
const MEMORIES_IN_STATE = 8;
const DM_HISTORY = 8;

const photo = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;
const storyPhoto = (seed: string) => `https://picsum.photos/seed/${seed}/540/960`;

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
- קצרה: לרוב 3 עד 10 מילים, משפט אחד. אנשים לא כותבים פסקאות בוואטסאפ.
- לענות למה שנכתב אחרון, ישר לעניין. אם שאלו משהו, לענות על זה. אם כבר ענו לך, להתקדם ולא לשאול שוב.
- לא לצטט את מה שהצד השני כתב, ולא לחזור על בדיחה, ביטוי או דימוי שכבר היו בשיחה או במה שכתבת קודם.
- בלי שנינויות מתוחכמות ובלי דימויים. הומור, אם יש, פשוט ("חחח", "די נו").
- לא חייבים לסיים בשאלה.
- הודעה אחת. רק לפעמים, כשבאמת יש עוד משהו להגיד, שתי הודעות קצרות, כל אחת בשורה נפרדת.
- לא לחזור על משהו שכבר כתבת בשיחה הזאת, גם לא במילים אחרות: אם כבר אמרת את זה, להתקדם או לענות בקצרה.
רק ההודעות, בלי מירכאות.`;
const DM_MAX_PARTS = 2;

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
const SAFE_PHOTO_NOTE = 'Wholesome, family-friendly everyday scene; any people fully clothed.';
// Story photos are square too, but shown as a tall 9:16 crop of the middle.
const STORY_PHOTO_NOTE =
  '- This is for a story: keep the main subject in the center of the frame, since the sides get cropped.';

// Text posts are where people think out loud or ask the group something.
const TEXT_POST_TASK = `המשימה: לכתוב פוסט טקסט, בלי תמונה: מחשבה, שאלה לחברים, קיטור קטן או משהו שקרה לך.
- משפט אחד או שניים קצרים, עד 15 מילים בערך. כמו שאנשים כותבים בקבוצה של הבניין.
- בלי מוסר השכל, בלי משפט מוטיבציה ובלי האשטגים.
- לא לחזור על נושא של פוסט שכבר פרסמת.
רק הפוסט, בלי מירכאות.`;

// Stories are a passing moment, with the kind of short text people stick on them.
const STORY_TASK = `המשימה: לכתוב טקסט קצר שמופיע על הסטורי שלך, על משהו שקורה איתך ממש עכשיו.
- 1 עד 6 מילים, כמו טקסט שמדביקים על סטורי ("בוקר ☕", "מי ער?", "לא נורמלי", "נו באמת").
- לפעמים רק אימוג׳י אחד או שניים.
- בלי מוסר השכל ובלי האשטגים.
רק הטקסט, בלי מירכאות.`;

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
    private readonly changes: WorldChanges,
  ) {}

  /**
   * Decides what a character does this tick. Plans for all characters run in
   * parallel against the same snapshot; compose() then writes them, commit() saves them.
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
        with: { messages: { orderBy: desc(messages.createdAt), limit: DM_HISTORY, with: { story: true } } },
      }),
      this.postsSinceLastPost(ctx.worldId, character.accountId),
    ]);

    const me = character.account;
    const history = (dm?.messages ?? []).toReversed().map((m) => ({
      from: m.senderId === me.id ? me.username : ctx.player.username,
      text: dmText(m),
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
      realLife: ctx.realLife,
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
      text_post: 'Write a text-only post, no photo: a thought, a question to your friends, a small rant',
      story: 'Share a story: a quick moment from right now, with a few words on it (gone after a day)',
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
        : `You are ${me.username}. What do you do right now? This is a shared flat and its people, so ` +
          'mostly people talk: text posts to everyone (a rant, a question to the flat, a complaint), comments ' +
          "on each other's posts, a private message to the new roommate. Stories for small moments, photo " +
          'posts for nicer ones (likely if several others have posted since your last post). ' +
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

  /**
   * Writes what the plan calls for (the AI part), without saving anything. Turns are
   * composed in parallel, and possibly ahead of time (WorldService.prepare): nothing
   * shows in the world until commit(). Null if there turned out to be nothing to do.
   */
  async compose(ctx: TickContext, plan: TurnPlan): Promise<Draft | null> {
    const system = this.systemPrompt(ctx, plan.character, plan.memories);
    switch (plan.action) {
      case 'post':
        return { kind: 'post', plan, system, caption: clean(await this.ai.generate(POST_TASK, { system, ...SHORT_TEXT, maxTokens: 300 })) };
      case 'text_post':
        return { kind: 'text_post', plan, caption: clean(await this.ai.generate(TEXT_POST_TASK, { system, ...SHORT_TEXT, maxTokens: 300 })) };
      case 'story':
        return { kind: 'story', plan, system, text: clean(await this.ai.generate(STORY_TASK, { system, ...SHORT_TEXT })) };
      case 'comment':
        return this.composeComment(ctx, plan, system);
      case 'comment_on_player_post': {
        // Comments on (and likes) the player's newest post this character hasn't reacted to.
        const target = newPlayerPost(ctx, plan.character.account);
        return target ? this.composeCommentOn(target, plan, system, true) : null;
      }
      case 'reply_to_player_comment':
        return plan.repliedPost ? this.composeReplyToPlayer(ctx, plan, plan.repliedPost, system) : null;
      case 'message_player':
        return { kind: 'message', plan, texts: await this.composeDm(ctx, plan, system) };
      case 'nothing':
        return null;
    }
  }

  /** Saves a composed turn: this is when it happens in the world. Returns the tick event, or null if it was dropped. */
  async commit(ctx: TickContext, draft: Draft): Promise<TickEvent | null> {
    const { character } = draft.plan;
    switch (draft.kind) {
      case 'post':
        return this.post(ctx, character, draft.system, draft.caption);
      case 'text_post':
        return this.textPost(ctx, character, draft.caption);
      case 'story':
        return this.story(ctx, character, draft.system, draft.text);
      case 'comment':
        return this.saveComment(character, draft.target, draft.text, draft.like);
      case 'message': {
        if (!draft.texts.length) return null;
        const { id, text } = await this.saveDm(ctx, draft.plan, draft.texts);
        return { type: 'message', actor: toUser(character.account), conversationId: id, text };
      }
    }
  }

  // Prompts are in Hebrew on purpose: English instructions make the model "think" in
  // English and the Hebrew comes out sounding translated. Task instructions use the
  // infinitive ("לכתוב"); gender is stated explicitly (see selfGender / addressAs).
  private systemPrompt(ctx: Pick<TickContext, 'activeBeat' | 'realLife'>, character: Character, memories: string[]) {
    const lines = [
      character.persona,
      '',
      `שם המשתמש שלך הוא @${character.account.username} ברשת StatUs (רשת כמו אינסטגרם). תמיד להישאר בדמות.`,
      selfGender(character.account),
      'לכתוב משהו חדש בקול שלך. אף פעם לא להעתיק או לחזור על מה שמישהו אחר כתב.',
      // Without this, a persona's quirks turn into a tic in every line ("(רשמתי בגיליון)", "נשבע").
      'הסגנון שלך (ביטויים קבועים, חתימה, סוגריים, מילים שאת או אתה אוהבים) מופיע רק לפעמים, לכל היותר פעם בכמה ' +
        'הודעות. לא לחזור על בדיחה, ביטוי או נושא שכבר כתבת לאחרונה (ראו "דברים שקרו לאחרונה").',
      'קצר: בלי הקדמות ובלי הסברים, כמו אדם אמיתי שכותב מהטלפון.',
      // The whole story is a comedy; the persona says how this character is funny.
      'החבורה שלך מצחיקה: הומור ישראלי יומיומי, הגזמות קטנות, עקיצות חמות ודרמה על שטויות. גם כשמשהו רציני, לכתוב אותו בדרך שלך, עם קריצה.',
    ];
    if (ctx.realLife.length) {
      lines.push(
        '',
        'מה קרה לאחרונה במציאות, מחוץ לרשת (היית שם או שמעת על זה; אפשר להתייחס לזה):',
        ...ctx.realLife.map((s) => `- ${s.place}: ${s.recap}${s.playerChose ? ` (${s.playerChose})` : ''}`),
      );
    }
    if (character.secrets.length) {
      lines.push(
        '',
        // Asked directly in a DM, characters used to just tell: the secret is the story's twist.
        'סודות שלך. לא לספר אותם, גם אם שואלים אותך ישירות ובלחץ: להתחמק בהומור, לשנות נושא או לרמוז ' +
          'רמז קטן. סוד יוצא רק כש"מה שקורה איתך עכשיו" (למטה) אומר לך לספר אותו:',
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
   * The caption is already written; the photo is drawn and the post saved in the
   * background (publish), so the tick doesn't wait for image generation. The post appears
   * in the feed a few seconds after the tick, so other agents only see it from the next tick.
   */
  private async post(ctx: TickContext, character: Character, system: string, caption: string): Promise<TickEvent> {
    const postId = randomUUID();
    void this.changes
      .track(ctx.worldId, () => this.publish(ctx, character, system, postId, caption))
      .catch((error: unknown) =>
        this.logger.warn(`Could not publish @${character.account.username}'s post: ${String(error)}`),
      );
    await this.remember(character, `פרסמתי פוסט: ${caption}`);
    return { type: 'post', actor: toUser(character.account), postId, text: caption };
  }

  private async publish(ctx: TickContext, character: Character, system: string, id: string, caption: string) {
    // If the photo can't be drawn, it goes out as a text post: the caption still says
    // what the character meant (and a post the story needed isn't lost).
    const image = await this.photo(ctx, character, system, 'posts', `The caption: ${caption}`).catch((error: unknown) => {
      this.logger.warn(`No photo for @${character.account.username}'s post, posting it as text: ${String(error)}`);
      return null;
    });
    await this.db.insert(posts).values({
      id,
      worldId: ctx.worldId,
      authorId: character.accountId,
      imageUrl: image?.url ?? null,
      imageDescription: image?.description ?? null,
      caption,
      likeCount: 5 + Math.floor(Math.random() * 80),
    });
  }

  /** A post without a photo. Nothing to draw, so it's saved right away. */
  private async textPost(ctx: TickContext, character: Character, caption: string): Promise<TickEvent> {
    const [row] = await this.db
      .insert(posts)
      .values({
        worldId: ctx.worldId,
        authorId: character.accountId,
        imageUrl: null,
        caption,
        likeCount: 3 + Math.floor(Math.random() * 40),
      })
      .returning();
    ctx.feed.unshift({
      id: row.id,
      author: character.account,
      caption,
      imageDescription: null,
      createdAt: row.createdAt,
      comments: [],
    });
    await this.remember(character, `כתבתי פוסט: ${caption}`);
    return { type: 'post', actor: toUser(character.account), postId: row.id, text: caption };
  }

  /** A quick moment from right now, gone after a day. Saved in the background, like posts. */
  private async story(ctx: TickContext, character: Character, system: string, text: string): Promise<TickEvent> {
    const storyId = randomUUID();
    void this.changes
      .track(ctx.worldId, () => this.publishStory(ctx, character, system, storyId, text))
      .catch((error: unknown) =>
        this.logger.warn(`Could not publish @${character.account.username}'s story: ${String(error)}`),
      );
    await this.remember(character, `העליתי סטורי: ${text}`);
    return { type: 'story', actor: toUser(character.account), storyId, text };
  }

  private async publishStory(ctx: TickContext, character: Character, system: string, id: string, text: string) {
    const image = await this.photo(ctx, character, system, 'stories', `The text on your story: ${text}`);
    await this.db.insert(stories).values({
      id,
      worldId: ctx.worldId,
      authorId: character.accountId,
      imageUrl: image.url,
      imageDescription: image.description,
      text,
    });
  }

  /**
   * The photo for a new post or story: the character describes it (in English, which
   * image models follow best) and the image provider draws it, with one retry. If that
   * fails too, it throws and the post is dropped: an unrelated photo looks worse.
   * Without an image provider, it gets a random placeholder photo.
   */
  private async photo(
    ctx: TickContext,
    character: Character,
    system: string,
    kind: 'posts' | 'stories',
    about: string,
  ) {
    if (this.ai.providers.image === 'none') {
      const seed = `${character.account.username}-${ctx.tick}-${Date.now()}`;
      return { url: kind === 'posts' ? photo(seed) : storyPhoto(seed), description: null };
    }
    const task = kind === 'posts' ? PHOTO_TASK : `${PHOTO_TASK}\n${STORY_PHOTO_NOTE}`;
    const description = clean(
      await this.ai.generate(`${task}\n\n${about}`, {
        system,
        hebrew: false,
        temperature: 0.7,
        maxTokens: 300,
      }),
    );
    const draw = (style: string) =>
      this.ai.generateImage(`${description}\n\n${style}`) ?? Promise.reject(new Error('No image provider'));
    const jpeg = await draw(PHOTO_STYLE).catch((error: unknown) => {
      this.logger.warn(`Image generation failed for @${character.account.username}, retrying: ${String(error)}`);
      // The image model's safety filter flags ordinary scenes now and then (a runner, the beach); say it plainly.
      return draw(`${PHOTO_STYLE} ${SAFE_PHOTO_NOTE}`);
    });
    const path = `${ctx.worldId}/${kind}/${randomUUID()}.jpg`;
    return { url: await this.storage.upload(path, jpeg, 'image/jpeg'), description };
  }

  private async composeComment(ctx: TickContext, plan: TurnPlan, system: string): Promise<Draft | null> {
    const me = plan.character.account;
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
    return target ? this.composeCommentOn(target, plan, system, false) : null;
  }

  private async composeCommentOn(target: FeedPost, plan: TurnPlan, system: string, like: boolean): Promise<Draft> {
    const text = clean(
      await this.ai.generate(
        `${postContext(target)}\n${addressAs(target.author)}\n\n` + COMMENT_TASK,
        { system, ...SHORT_TEXT },
      ),
    );
    return { kind: 'comment', plan, target, text, like };
  }

  private async composeReplyToPlayer(ctx: TickContext, plan: TurnPlan, target: FeedPost, system: string): Promise<Draft> {
    const player = ctx.player.username;
    const text = clean(
      await this.ai.generate(
        `${postContext(target)}\n${addressAs(ctx.player)}\n\n` +
          `המשימה: לענות לתגובה האחרונה של @${player} על הפוסט שלך, בתגובה קצרה ` +
          `שמתחילה ב-@${player}. רק התגובה, משפט אחד. בלי מירכאות.`,
        { system, ...SHORT_TEXT },
      ),
    );
    return { kind: 'comment', plan, target, text, like: false };
  }

  /** `like`: also like the post (when reacting to the player's new post). */
  private async saveComment(character: Character, target: FeedPost, text: string, like: boolean): Promise<TickEvent | null> {
    // Small models sometimes parrot an existing comment (or one written in parallel this
    // tick, committed just before); drop those rather than post a copy.
    if (!text || target.comments.some((c) => c.text === text) || text === target.caption) return null;
    // Synchronously, before any await: commits run in parallel, and the next one checks against it.
    target.comments.push({ author: character.account, text });

    await Promise.all([
      this.db.insert(comments).values({ postId: target.id, authorId: character.accountId, text }),
      this.remember(character, `הגבתי לפוסט של ${target.author.username}: ${text}`),
      like && this.db.update(posts).set({ likeCount: sql`${posts.likeCount} + 1` }).where(eq(posts.id, target.id)),
    ]);
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
      with: { messages: { orderBy: desc(messages.createdAt), limit: DM_HISTORY, with: { story: true } } },
    });
    if (!conversation || conversation.messages[0]?.senderId !== player.id) return null;

    const [character, sceneRows] = await Promise.all([
      this.db.query.characters.findFirst({
        where: eq(characters.accountId, conversation.agentId),
        with: {
          account: true,
          memories: { orderBy: desc(characterMemories.createdAt), limit: MEMORIES_IN_STATE },
        },
      }),
      this.db.query.scenes.findMany({
        where: eq(scenes.worldId, player.worldId),
        orderBy: desc(scenes.createdAt),
        limit: REAL_LIFE_IN_PROMPT,
      }),
    ]);
    if (!character) return null;

    const history = conversation.messages.toReversed().map((m) => ({
      from: m.senderId === player.id ? player.username : character.account.username,
      text: dmText(m),
    }));
    const ctx = {
      worldId: player.worldId,
      player,
      // No story direction in a reply: it's an answer to what the player just wrote. With
      // the direction, every reply repeated it ("we need to talk tomorrow") until the next
      // tick; directed messages are sent in ticks.
      activeBeat: null,
      realLife: toRealLife(sceneRows, player),
    };
    const system = this.systemPrompt(ctx, character, character.memories.map((m) => m.content));
    const dmPlan = { character, dm: { id: conversation.id, history } };
    const texts = await this.composeDm(ctx, dmPlan, system);
    if (!texts.length) return null;
    const { row } = await this.saveDm(ctx, dmPlan, texts);
    return row;
  }

  /** The character's next DM to the player, split into the quick messages it's sent as. */
  private async composeDm(
    ctx: Pick<TickContext, 'player'>,
    plan: Pick<TurnPlan, 'dm'>,
    system: string,
  ): Promise<string[]> {
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
    // Each line is its own message, like a few quick WhatsApp texts in a row.
    return text.split('\n').map(clean).filter(Boolean).slice(0, DM_MAX_PARTS);
  }

  /** Saves the character's DM to the player, opening the conversation if needed. */
  private async saveDm(
    ctx: Pick<TickContext, 'worldId' | 'player'>,
    plan: Pick<TurnPlan, 'character' | 'dm'>,
    texts: string[],
  ) {
    const player = ctx.player.username;
    let id = plan.dm.id;
    if (!id) {
      const [row] = await this.db
        .insert(conversations)
        .values({ worldId: ctx.worldId, agentId: plan.character.accountId })
        .returning();
      id = row.id;
    }
    // Explicit timestamps a millisecond apart keep the messages in order (not later:
    // that would leave them unread after the user reads the conversation).
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

/** A DM as the agent reads it: a reply to one of their stories says which story. */
function dmText(message: { text: string; story: { text: string | null; imageDescription: string | null } | null }) {
  const { story } = message;
  if (!story) return message.text;
  const about = [story.text && `"${story.text}"`, story.imageDescription && `בתמונה: ${story.imageDescription}`]
    .filter(Boolean)
    .join(', ');
  return `(תגובה לסטורי שלך${about ? `: ${about}` : ''}) ${message.text}`;
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
