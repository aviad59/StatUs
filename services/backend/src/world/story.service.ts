import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Chapter, Scene, StoryNow } from '@status/shared';
import { and, asc, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import {
  accounts,
  characters,
  comments,
  conversations,
  messages,
  posts,
  scenes,
  stories,
  storyBeats,
  worlds,
} from '../db/schema';
import { STORY_TTL_MS } from '../feed/feed.service';
import { StorageService } from '../storage/storage.service';
import type { TickContext } from './agent.service';
import { AFTER_ARC, ARC, FIRST_DIRECTED_ACT } from './arc';
import { WorldChanges } from './world-changes';

type Account = typeof accounts.$inferSelect;
type Beat = typeof storyBeats.$inferSelect;
type SceneRow = typeof scenes.$inferSelect;

// A beat that hasn't played out after this many ticks is closed anyway, so the story never stalls.
const BEAT_MAX_TICKS = 4;
const BEAT_MIN_TICKS = 2;
const BEATS_IN_PROMPT = 6;
const POSTS_IN_PROMPT = 8;
const DMS_IN_PROMPT = 16;
const SCENES_IN_PROMPT = 4;
const SCENES_LISTED = 20;
const WRITE_RETRIES = 2;
const WRITE_RETRY_MS = 10_000;
const WRITE_BACKOFF_MS = 3 * 60_000;

const SCENE_PHOTO_STYLE =
  'Candid smartphone photo taken by someone who is there, natural light, realistic, slightly imperfect framing, ' +
  'Israel. People only from behind, from a distance or as hands; no close-up faces. No text or signs.';

/** What a character still has to do in the active beat, or null if nothing. */
export function directionFor(beat: Beat | null, username: string): string | null {
  if (!beat || beat.actedBy.includes(username)) return null;
  return beat.directions[username] ?? null;
}

/**
 * Whether the beat is over after this tick: every directed character acted (and, if its
 * scene asks the player to choose, they have: StoryService.choose ends it then), or it
 * ran too long, in which case the group decides without the player.
 */
export function beatDone(beat: Beat, tick: number, acted: string[], awaitingChoice: boolean) {
  const actedBy = [...new Set([...beat.actedBy, ...acted])];
  const startedTick = beat.startedTick ?? tick;
  const ticks = tick - startedTick + 1;
  if (ticks >= BEAT_MAX_TICKS) return true;
  // Even when everyone directed acted in its first tick, a chapter stays for another one:
  // the player needs a turn to read it and answer before the story moves on.
  if (ticks < BEAT_MIN_TICKS) return false;
  return !awaitingChoice && Object.keys(beat.directions).every((username) => actedBy.includes(username));
}

export const toScene = (row: SceneRow): Scene => ({
  id: row.id,
  place: row.place,
  text: row.text,
  imageUrl: row.imageUrl,
  choices: row.choices,
  chosen: row.chosen,
  createdAt: row.createdAt.toISOString(),
});

/**
 * The storyline. Each beat names who drives it and what each of them does
 * (directions); it ends once they have all acted, or after BEAT_MAX_TICKS. Then the
 * next seeded beat starts, or, when those run out, the story director (an AI writer
 * that sees everything: secrets, relationships, what the player did) writes one,
 * following the season's arc (arc.ts), often with a scene of what happened in real life.
 */
@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);
  // Worlds whose next beat is being written right now.
  private readonly writing = new Set<string>();
  // When writing a world's next beat last failed for good (see ensureBeat).
  private readonly failedAt = new Map<string, number>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly changes: WorldChanges,
  ) {}

  /** Runs after each tick, with the usernames of directed characters who acted in it. */
  async advance(ctx: TickContext, acted: string[]) {
    const beat = ctx.activeBeat;
    if (beat) {
      const actedBy = [...new Set([...beat.actedBy, ...acted])];
      const startedTick = beat.startedTick ?? ctx.tick;
      const done = beatDone(beat, ctx.tick, acted, ctx.awaitingChoice);
      await this.db
        .update(storyBeats)
        .set(done ? { actedBy, startedTick, status: 'done', completedAt: new Date() } : { actedBy, startedTick })
        .where(eq(storyBeats.id, beat.id));
      if (!done) return;
      this.logger.log(`Story beat done: ${beat.key}`);
    }
    await this.next(ctx.worldId, ctx.player, ctx.tick);
  }

  /**
   * Makes sure the story has a chapter going: if there's no active beat (writing the last
   * one failed, even after retries), starts the next one. Called before preparing a tick.
   */
  async ensureBeat(worldId: string, player: Account, tick: number) {
    if (this.writing.has(worldId)) return;
    // After a failure (retries included), wait before asking again: if the provider is
    // down, every change to the world would otherwise start another round of attempts.
    const failedAt = this.failedAt.get(worldId);
    if (failedAt && Date.now() - failedAt < WRITE_BACKOFF_MS) return;
    const active = await this.db.query.storyBeats.findFirst({
      where: and(eq(storyBeats.worldId, worldId), eq(storyBeats.status, 'active')),
      columns: { id: true },
    });
    if (!active) await this.next(worldId, player, tick);
  }

  /** Whether the director is writing this world's next beat right now (WorldStatus.storyWriting). */
  isWriting(worldId: string) {
    return this.writing.has(worldId);
  }

  /**
   * The story as the player knows it: the season, the act, the chapter going on now
   * (what's happening, what they can do, and its real-life scene) and the ones before.
   * Only player-facing fields: never a beat's description or directions.
   */
  async storyNow(worldId: string): Promise<StoryNow> {
    const [world, beats, sceneRows, people] = await Promise.all([
      this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) }),
      this.db.query.storyBeats.findMany({
        where: and(eq(storyBeats.worldId, worldId), ne(storyBeats.status, 'pending')),
        orderBy: asc(storyBeats.position),
      }),
      this.db.query.scenes.findMany({ where: eq(scenes.worldId, worldId), orderBy: asc(scenes.createdAt) }),
      this.db.query.accounts.findMany({ where: eq(accounts.worldId, worldId) }),
    ]);
    const byUsername = new Map(people.map((a) => [a.username, a]));
    const chapters = beats.map((beat, i): Chapter => {
      const current = beat.status === 'active';
      const scene = sceneRows.findLast((s) => s.beatId === beat.id);
      const hintUser = current && beat.hintUser ? byUsername.get(beat.hintUser) : undefined;
      return {
        id: beat.id,
        number: i + 1,
        title: beat.title,
        brief: beat.brief,
        hint: current ? beat.hint : null,
        hintUser: hintUser ? toUser(hintUser) : null,
        scene: scene ? toScene(scene) : null,
        current,
      };
    });
    // worlds.arc_act is the act the director writes in; the seed's own beats (keys not
    // "director_…") are the scripted act before it.
    const currentBeat = beats.find((b) => b.status === 'active');
    const scripted = Boolean(currentBeat && !currentBeat.key.startsWith('director_'));
    const actIndex = scripted ? FIRST_DIRECTED_ACT - 1 : (world?.arcAct ?? 0);
    const act = ARC.acts[actIndex];
    return {
      season: { title: ARC.title, logline: ARC.logline },
      act: act ? { number: actIndex + 1, total: ARC.acts.length, title: act.title } : null,
      current: chapters.find((c) => c.current) ?? null,
      past: chapters.filter((c) => !c.current).toReversed(),
      writing: this.writing.has(worldId),
    };
  }

  /** The newest scenes, for the feed. */
  async list(worldId: string): Promise<Scene[]> {
    const rows = await this.db.query.scenes.findMany({
      where: eq(scenes.worldId, worldId),
      orderBy: desc(scenes.createdAt),
      limit: SCENES_LISTED,
    });
    return rows.map(toScene);
  }

  /**
   * The player answers a scene with what they do there. Once per scene. If the scene's
   * beat is still going and its characters have all acted, the answer ends it, so the
   * next beat (written from it) starts right away; otherwise the beat plays on, now
   * with the answer (it ends after its characters act, see beatDone).
   */
  async choose(player: Account, sceneId: string, choice: string): Promise<Scene> {
    const scene = await this.db.query.scenes.findFirst({
      where: and(eq(scenes.id, sceneId), eq(scenes.worldId, player.worldId)),
    });
    if (!scene || !scene.choices.some((c) => c.key === choice)) throw new NotFoundException();
    const [updated] = await this.db
      .update(scenes)
      .set({ chosen: choice, chosenAt: new Date() })
      .where(and(eq(scenes.id, sceneId), isNull(scenes.chosen)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'ALREADY_CHOSEN', message: 'This was already decided.' });

    const beat = scene.beatId
      ? await this.db.query.storyBeats.findFirst({
          where: and(eq(storyBeats.id, scene.beatId), eq(storyBeats.status, 'active')),
        })
      : undefined;
    const [ended] =
      beat && Object.keys(beat.directions).every((username) => beat.actedBy.includes(username))
        ? await this.db
            .update(storyBeats)
            .set({ status: 'done', completedAt: new Date() })
            .where(and(eq(storyBeats.id, beat.id), eq(storyBeats.status, 'active')))
            .returning()
        : [];
    if (ended) {
      this.logger.log(`Story beat done (player chose "${choice}"): ${ended.key}`);
      const world = await this.db.query.worlds.findFirst({ where: eq(worlds.id, player.worldId) });
      await this.next(player.worldId, player, world?.tick ?? 0);
    } else {
      this.changes.changed(player.worldId);
    }
    return toScene(updated);
  }

  /** Starts the next seeded beat, or has the director write one (in the background). */
  private async next(worldId: string, player: Account, tick: number) {
    const pending = await this.db.query.storyBeats.findFirst({
      where: and(eq(storyBeats.worldId, worldId), eq(storyBeats.status, 'pending')),
      orderBy: asc(storyBeats.position),
    });
    if (pending) {
      await this.db.transaction(async (tx) => {
        await tx.update(storyBeats).set({ status: 'active', startedTick: tick + 1 }).where(eq(storyBeats.id, pending.id));
        // A seeded beat may come with its scene, written in advance: it happens now.
        if (pending.plannedScene) {
          await tx.insert(scenes).values({ worldId, beatId: pending.id, ...pending.plannedScene });
        }
      });
      return;
    }
    // Takes a while: the next ticks run without a beat until it's ready. Tracked, so the
    // next tick gets prepared again with the new beat once it's written.
    void this.changes
      .track(worldId, () => this.writeWithRetries(worldId, player))
      .catch((error: unknown) => this.logger.warn(`Could not write the next story beat: ${String(error)}`));
  }

  /** A network blip or a malformed answer shouldn't leave the story without a next chapter. */
  private async writeWithRetries(worldId: string, player: Account) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.writeNextBeat(worldId, player);
        this.failedAt.delete(worldId);
        return;
      } catch (error) {
        if (attempt > WRITE_RETRIES) {
          this.failedAt.set(worldId, Date.now());
          throw error;
        }
        this.logger.warn(`Writing the next story beat failed (attempt ${attempt}), retrying: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_MS * attempt));
      }
    }
  }

  private async writeNextBeat(worldId: string, player: Account) {
    if (this.writing.has(worldId)) return;
    this.writing.add(worldId);
    try {
      const [world, cast, beats, feed, dms, storyRows, sceneRows] = await Promise.all([
        this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) }),
        this.db.query.characters.findMany({
          where: eq(characters.worldId, worldId),
          with: { account: true, relationships: { with: { target: true } } },
        }),
        this.db.query.storyBeats.findMany({
          where: eq(storyBeats.worldId, worldId),
          orderBy: desc(storyBeats.position),
          limit: BEATS_IN_PROMPT,
        }),
        this.db.query.posts.findMany({
          where: eq(posts.worldId, worldId),
          orderBy: desc(posts.createdAt),
          limit: POSTS_IN_PROMPT,
          with: { author: true, comments: { orderBy: asc(comments.createdAt), with: { author: true } } },
        }),
        this.db.query.conversations.findMany({
          where: eq(conversations.worldId, worldId),
          with: { agent: true, messages: { orderBy: desc(messages.createdAt), limit: DMS_IN_PROMPT } },
        }),
        this.db.query.stories.findMany({
          where: and(eq(stories.worldId, worldId), gt(stories.createdAt, new Date(Date.now() - STORY_TTL_MS))),
          orderBy: asc(stories.createdAt),
          with: { author: true },
        }),
        this.db.query.scenes.findMany({
          where: eq(scenes.worldId, worldId),
          orderBy: desc(scenes.createdAt),
          limit: SCENES_IN_PROMPT,
        }),
      ]);
      if (!world) return;

      const castText = cast.map((c) => {
        const rels = c.relationships.map((r) => `@${r.target.username} ${r.score}`).join(', ');
        return [
          `@${c.account.username} (${c.account.name}, ${c.account.gender === 'female' ? 'אישה' : 'גבר'})`,
          `אישיות: ${c.persona}`,
          c.secrets.length ? `סודות: ${c.secrets.join(' / ')}` : '',
          rels ? `יחסים (מ-100- עוינות עד 100 מסירות): ${rels}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });
      const beatsText = beats.toReversed().map((b) => `- ${b.title}: ${b.description}`);
      const feedText = feed.toReversed().map((p) => {
        const thread = p.comments.map((c) => `\n    @${c.author.username}: ${c.text}`).join('');
        return `- @${p.author.username}: ${p.caption}${thread}`;
      });
      const dmText = dms
        .flatMap((c) =>
          c.messages.map((m) => ({
            at: m.createdAt,
            line: `- ${m.senderId === player.id ? `@${player.username} ל-@${c.agent.username}` : `@${c.agent.username} ל-@${player.username}`}: ${m.text}`,
          })),
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(-DMS_IN_PROMPT)
        .map((m) => m.line);
      const scenesText = sceneRows.toReversed().map((s) => {
        const picked = s.choices.find((c) => c.key === s.chosen);
        const decision = s.choices.length
          ? picked
            ? ` השחקן בחר: "${picked.label}".`
            : ` השחקן עוד לא בחר (האפשרויות: ${s.choices.map((c) => `"${c.label}"`).join(', ')}).`
          : '';
        return `- ${s.place}: ${s.recap}${decision}`;
      });

      const act = ARC.acts[world.arcAct];
      const prompt = [
        `השחקן: @${player.username} (${playerGender(player)})`,
        '',
        'הדמויות:',
        castText.join('\n\n'),
        '',
        ...arcSection(world.arcAct, world.arcActBeats),
        '',
        'הסיפור עד עכשיו:',
        world.storySummary || 'עוד אין סיכום.',
        '',
        'פרקים אחרונים (מהישן לחדש):',
        ...(beatsText.length ? beatsText : ['אין עדיין.']),
        '',
        'מה קרה לאחרונה במציאות (סצנות, מהישן לחדש):',
        ...(scenesText.length ? scenesText : ['אין עדיין.']),
        '',
        'פוסטים אחרונים ברשת (מהישן לחדש):',
        ...(feedText.length ? feedText : ['אין עדיין.']),
        '',
        'סטוריז מהיממה האחרונה (מהישן לחדש):',
        ...(storyRows.length
          ? storyRows.map((s) => `- @${s.author.username}: ${s.text ?? ''}${s.imageDescription ? ` (בתמונה: ${s.imageDescription})` : ''}`)
          : ['אין.']),
        '',
        'הודעות פרטיות אחרונות עם השחקן:',
        ...(dmText.length ? dmText : ['אין עדיין.']),
        '',
        'לכתוב את הפרק הבא.',
      ].join('\n');

      const usernames = new Set(cast.map((c) => c.account.username));
      const write = async (extra = '') =>
        parseBeat(
          await this.ai.generate(prompt + extra, {
            system: directorSystem(player.username),
            hebrew: false,
            temperature: 0.9,
            maxTokens: 2500,
          }),
          usernames,
        );
      let beat = await write();

      // The act ends when the director says its goal is met (not before minBeats), or at maxBeats.
      const actBeats = world.arcActBeats + 1;
      const closesAct = (b: typeof beat) => (act ? (b.actDone && actBeats >= act.minBeats) || actBeats >= act.maxBeats : false);
      // An act opens and closes in real life: the player should see those moments, not just hear of them.
      if (act && !beat.scene && (world.arcActBeats === 0 || closesAct(beat))) {
        beat = await write('\n\nחשוב: בפרק הזה חובה סצנה ("scene" לא יכול להיות null) עם 2 או 3 אפשרויות ב-"choices", כי הוא פותח או סוגר מערכה.');
      }
      // Whatever happens in real life, the player answers with what they do there.
      if (beat.scene && !beat.scene.choices.length) {
        beat = await write('\n\nחשוב: בסצנה חובה "choices" עם 2 או 3 אפשרויות למה שהשחקן עושה שם.');
      }
      const actOver = closesAct(beat);
      const position = (beats[0]?.position ?? -1) + 1;
      const image = beat.scene?.image ? await this.sceneImage(worldId, beat.scene.image) : null;

      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(storyBeats)
          .values({
            worldId,
            key: `director_${position}`,
            title: beat.title,
            description: beat.description,
            brief: beat.brief,
            hint: beat.hint,
            hintUser: beat.hintUser,
            directions: beat.directions,
            position,
            status: 'active',
            startedTick: world.tick + 1,
          })
          .returning();
        if (beat.scene) {
          await tx.insert(scenes).values({
            worldId,
            beatId: row.id,
            place: beat.scene.place,
            text: beat.scene.text,
            recap: beat.scene.recap,
            imageUrl: image?.url ?? null,
            imageDescription: image?.description ?? null,
            choices: beat.scene.choices,
          });
        }
        await tx
          .update(worlds)
          .set({
            storySummary: beat.summary,
            ...(act && { arcAct: actOver ? world.arcAct + 1 : world.arcAct, arcActBeats: actOver ? 0 : actBeats }),
          })
          .where(eq(worlds.id, worldId));
      });
      this.logger.log(
        `New story beat: ${beat.title} (${Object.keys(beat.directions).join(', ')})` +
          (act ? ` · act ${world.arcAct + 1} "${act.title}" beat ${actBeats}${actOver ? ', act done' : ''}` : '') +
          (beat.scene ? ` · scene: ${beat.scene.place}${beat.scene.choices.length ? ' (choice)' : ''}` : ''),
      );
    } finally {
      this.writing.delete(worldId);
    }
  }

  /** The scene's photo, or null without an image provider or if drawing it fails (the scene works without it). */
  private async sceneImage(worldId: string, description: string) {
    const attempt = async () => {
      const jpeg = await this.ai.generateImage(`${description}\n\n${SCENE_PHOTO_STYLE}`);
      if (!jpeg) return null;
      const url = await this.storage.upload(`${worldId}/scenes/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
      return { url, description };
    };
    // One retry, like post photos (drawing and uploading both fail now and then).
    try {
      return await attempt().catch((error: unknown) => {
        this.logger.warn(`Scene photo failed, retrying: ${String(error)}`);
        return attempt();
      });
    } catch (error) {
      this.logger.warn(`Could not draw the scene's photo: ${String(error)}`);
      return null;
    }
  }
}

function playerGender(player: Account) {
  if (player.gender === 'female') return 'אישה: לפנות אליה בלשון נקבה';
  if (player.gender === 'male') return 'גבר: לפנות אליו בלשון זכר';
  return 'מגדר לא ידוע: לפנות בלשון רבים';
}

/** Where the season is, for the director: the premise, the hidden truth, and the current act. */
function arcSection(actIndex: number, actBeats: number): string[] {
  const act = ARC.acts[actIndex];
  if (!act) return ['העונה:', AFTER_ARC];
  const done = ARC.acts.slice(0, actIndex).map((a, i) => `${i + 1}. ${a.title}`);
  const left = act.maxBeats - actBeats;
  return [
    `העונה: "${ARC.title}"`,
    ARC.premise,
    '',
    `האמת (ידועה רק לכותבי העלילה; לחשוף אותה לאט, דרך מה שהדמויות מגלות): ${ARC.truth}`,
    '',
    ...(done.length ? ['מערכות שכבר היו:', ...done] : []),
    `המערכה הנוכחית (${actIndex + 1} מתוך ${ARC.acts.length}): "${act.title}"`,
    `מה צריך לקרות בה: ${act.goal}`,
    `הפרק הזה הוא פרק ${actBeats + 1} במערכה${actBeats === 0 ? ', והוא פותח אותה: חובה סצנה' : ''}. ${
      left <= 1
        ? 'זה הפרק האחרון שלה: לסגור אותה עכשיו (actDone: true), עם סצנה (חובה) ובחירה אם המערכה דורשת.'
        : actBeats + 1 < act.minBeats
          ? 'מוקדם מדי לסגור אותה.'
          : 'אפשר לסגור אותה אם מה שצריך כבר קרה.'
    }`,
    actIndex === 0 && actBeats === 0
      ? 'זה הפרק הראשון של העונה: לחבר את מה שקרה עד עכשיו לאירוע שפותח אותה, בטבעיות.'
      : '',
  ].filter((line) => line !== '');
}

// Written in Hebrew like the other generation prompts. Agents never see the beat
// description, summary, arc or truth: they get only their own direction (and scene
// recaps, which only say what everyone there saw), so secrets stay secret until a
// character actually reveals them.
const directorSystem = (player: string) => `התפקיד: לכתוב את העלילה של StatUs, רשת חברתית כמו אינסטגרם. כל החשבונות הם דמויות, חוץ מאדם אמיתי אחד: השחקן, @${player}, השותף החדש בדירת שותפים בפלורנטין. העלילה היא סיטקום ישראלי בפרקים קטנים, והשחקן הוא חלק ממנה: כולם באים אליו, והבחירות שלו משנות את ההמשך.

הטון: מצחיק, כמו סיטקום טוב. הומור ישראלי של חיי שותפים: פתקים על המקרר, תורנות כלים, מי גמר את החלב, המזגן שכולם רבים עליו, ועד הבית, ארנונה, שמוליק שכותב עם שגיאות, שקשוקה בשתיים בלילה, קבוצת הדירה שיוצאת משליטה. דמויות שמגזימות, נעלבות, מתווכחות על שטויות ומפתחות תיאוריות. הבדיחה באה מהדמויות ומהמצב, לא ממשחקי מילים. בלי לעג פוגעני לקבוצות אמיתיות.

בהירות: השחקן תמיד צריך להבין מה קורה ומה הוא יכול לעשות. כל פרק מקבל "brief" ו-"hint" שמוצגים לו בראש האפליקציה (ראו בתשובה). שפה פשוטה, בלי רמזים מעורפלים ובלי לצפות שיזכור פרטים מלפני כמה פרקים.

מה דמות יכולה לעשות בפרק ברשת (רק את אלה):
- לפרסם פוסט: תמונה וכיתוב.
- לכתוב פוסט טקסט בלי תמונה: מחשבה, שאלה לחבורה, קיטור. טוב לשאלות פומביות ולעקיצות.
- להעלות סטורי: תמונה של רגע עכשווי עם כמה מילים עליה, נעלם אחרי יום. טוב לרמזים ולמצבי רוח. השחקן יכול להגיב לסטורי בהודעה פרטית.
- להגיב על פוסט של מישהו אחר (על סטורי אי אפשר להגיב).
- לשלוח הודעה פרטית לשחקן. דמויות לא שולחות הודעות פרטיות זו לזו.

סצנה ("קרה בדירה"): מה שקורה מחוץ לרשת, פנים אל פנים: בסלון, במטבח, בחדר המדרגות, בבית הפתוח. השחקן נמצא שם, והסצנה מסופרת לו בגוף שני, בלשון שמתאימה למגדר שלו.
- לכתוב סצנה בפרקים שבהם קורה משהו פנים אל פנים: תמיד בפרק הראשון של מערכה ובפרק שסוגר אותה, ובערך בכל פרק שני. בשאר הפרקים "scene": null.
- ברורה וקצרה: 2 עד 3 משפטים קצרים, עד 45 מילים בסך הכול. המשפט הראשון אומר מי נמצא איפה ומה קרה. אחריו פרט מצחיק אחד או ציטוט קצר אחד. בלי רמזים מעורפלים, בלי לגלות סודות שהשחקן לא אמור לדעת עדיין.
- כל סצנה נגמרת ברגע שבו השחקן מגיב, ותמיד יש בה 2 או 3 אפשרויות קצרות ושונות באמת למה שהוא עושה שם עכשיו, בשם הפועל (למשל: "להעיד נגד גל", "לחטוף את הכפית ולברוח"). ברגעי החלטה גדולים (בסוף מערכה, כשהמערכה מבקשת) האפשרויות הן מה הדירה עושה, וכל אחת עם השלכות.
- הדמויות מתייחסות למה שהשחקן עשה בסצנה, ואחרי החלטה גדולה הפרק הבא חייב לקרות בעקבותיה. אם השחקן לא הגיב, החבורה ממשיכה בלעדיו ומישהו נעלב מזה.

כללים:
- כל פרק הוא צעד קטן אחד ברשת: 1 עד 3 דמויות, ולכל אחת פעולה אחת קונקרטית וקצרה שממשיכה את מה שקרה בסצנה. לא לתת לאותה דמות את אותה פעולה (או את אותו נושא) כמו בפרק הקודם.
- לפחות בכל פרק שני, דמות פונה לשחקן ישירות בהודעה פרטית: מבקשת עזרה, משתפת רמז, מבקשת שיבחר צד. השחקן הוא המתווך, הבלש והשופט של הדירה.
- השחקן משחק בטקסט: עונה בהודעות, מגיב לפוסטים, כותב פוסטים טקסט ובוחר בסצנות. לא לבקש ממנו לצלם או להעלות תמונה.
- להגיב למה שהשחקן עשה: עצה שנתן, צד שבחר, בחירה בסצנה, תגובה שכתב או הודעה שהתעלם ממנה. למעשים שלו יש השלכות.
- ללכת לפי המערכה הנוכחית של העונה ולקדם אותה, אבל לתת לסיפור לנשום: לא לדלג על שלבים. סודות נחשפים לאט: קודם רמזים, ורק אחר כך גילוי. לכל היותר סוד אחד בכל פרק.
- בלי פשעים חמורים, אלימות, מחלות קשות או מוות. זו קומדיה.
- להמשיך את מה שכבר קרה בלי לסתור אותו, ולא לחזור על אותו קו שוב ושוב.
- הוראה לפוסט או לסטורי אומרת על מה הוא ומה רואים בתמונה. הוראה לתגובה אומרת על הפוסט של מי.
- הכול בעברית, בלי צורות עם לוכסן ("את/ה").

התשובה: JSON בלבד, בלי שום טקסט לפניו או אחריו:
{
  "summary": "הסיפור עד עכשיו, מעודכן עם מה שקרה בפרקים, בסצנות, בפוסטים ובהודעות. עד 10 משפטים.",
  "title": "שם הפרק, 2 עד 5 מילים. מוצג לשחקן, אז בלי לגלות סוד. למשל: הזוג מרעננה",
  "description": "מה קורה בפרק ולמה, 2 עד 3 משפטים. לכותבים בלבד: מותר לכלול סודות.",
  "brief": "לשחקן, בגוף שני: מה קורה עכשיו, רק מה שהוא כבר יודע או רואה. משפט אחד פשוט, עד 20 מילים. למשל: שמוליק קבע בית פתוח ביום שישי, והשותפים רוצים להבריח את הקונים.",
  "hint": "לשחקן: מה אפשר לעשות עכשיו, פעולה אחת קונקרטית בשם הפועל. למשל: לענות לתמר בצ׳אט ולהחליט אם להשתתף בתוכנית",
  "hintUser": "שם המשתמש של מי שכדאי לכתוב לו עכשיו (בלי @), או null",
  "directions": {
    "<username>": "מה הדמות עושה, בשם הפועל, כהוראה אחת קונקרטית. למשל: לשלוח ל-@${player} הודעה ולשאול אם שם לב שהארנונה לא שולמה"
  },
  "actDone": false,
  "scene": {
    "place": "📍 איפה · מתי, קצר. למשל: 📍 הסלון · שישי, 11:40",
    "text": "הסצנה, לשחקן בגוף שני",
    "recap": "משפט אחד בגוף שלישי: מה קרה שם, רק מה שכל מי שהיה שם יודע",
    "image": "In English: what a photo taken there shows, 2 sentences, concrete. Or null",
    "choices": [{ "key": "a", "label": "אפשרות קצרה" }]
  }
}
("scene": null כשאין סצנה. בכל סצנה "choices" עם 2 או 3 אפשרויות. "actDone": true כשהפרק הזה משלים את מה שהמערכה צריכה.)`;

const sceneSchema = z.object({
  place: z.string().min(1).max(120),
  text: z.string().min(1).max(1500),
  recap: z.string().min(1).max(400),
  image: z.string().nullish(),
  choices: z
    .array(z.object({ key: z.string().min(1).max(20), label: z.string().min(1).max(100) }))
    .max(3)
    .default([]),
});

const beatSchema = z.object({
  summary: z.string().min(1),
  title: z.string().min(1).max(80),
  description: z.string().min(1),
  brief: z.string().min(1).max(400),
  hint: z.string().min(1).max(200),
  hintUser: z.string().nullish(),
  directions: z.record(z.string(), z.string().min(1)),
  actDone: z.boolean().default(false),
  scene: sceneSchema.nullish(),
});

function parseBeat(text: string, usernames: Set<string>) {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const beat = beatSchema.parse(JSON.parse(json));
  const directions = Object.fromEntries(
    Object.entries(beat.directions)
      .map(([username, direction]) => [username.replace(/^@/, ''), direction] as const)
      .filter(([username]) => usernames.has(username)),
  );
  if (!Object.keys(directions).length) throw new Error(`The new beat has no known characters: ${text}`);
  // A lone option isn't a choice.
  const scene = beat.scene && { ...beat.scene, choices: beat.scene.choices.length >= 2 ? beat.scene.choices : [] };
  // Only someone in the world can be messaged.
  const hintUser = beat.hintUser?.replace(/^@/, '');
  return { ...beat, directions, hintUser: hintUser && usernames.has(hintUser) ? hintUser : null, scene: scene ?? null };
}
