import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { type accounts, characters, comments, conversations, messages, posts, stories, storyBeats, worlds } from '../db/schema';
import { STORY_TTL_MS } from '../feed/feed.service';
import type { TickContext } from './agent.service';

type Account = typeof accounts.$inferSelect;
type Beat = typeof storyBeats.$inferSelect;

// A beat that hasn't played out after this many ticks is closed anyway, so the story never stalls.
const BEAT_MAX_TICKS = 4;
const BEATS_IN_PROMPT = 6;
const POSTS_IN_PROMPT = 8;
const DMS_IN_PROMPT = 16;

/** What a character still has to do in the active beat, or null if nothing. */
export function directionFor(beat: Beat | null, username: string): string | null {
  if (!beat || beat.actedBy.includes(username)) return null;
  return beat.directions[username] ?? null;
}

/**
 * The storyline. Each beat names who drives it and what each of them does
 * (directions); it ends once they have all acted, or after BEAT_MAX_TICKS. Then the
 * next seeded beat starts, or, when those run out, the story director (an AI writer
 * that sees everything: secrets, relationships, what the player did) writes one.
 */
@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);
  // Worlds whose next beat is being written right now.
  private readonly writing = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
  ) {}

  /** Runs after each tick, with the usernames of directed characters who acted in it. */
  async advance(ctx: TickContext, acted: string[]) {
    const beat = ctx.activeBeat;
    if (beat) {
      const actedBy = [...new Set([...beat.actedBy, ...acted])];
      const startedTick = beat.startedTick ?? ctx.tick;
      const done =
        Object.keys(beat.directions).every((username) => actedBy.includes(username)) ||
        ctx.tick - startedTick + 1 >= BEAT_MAX_TICKS;
      await this.db
        .update(storyBeats)
        .set(done ? { actedBy, startedTick, status: 'done', completedAt: new Date() } : { actedBy, startedTick })
        .where(eq(storyBeats.id, beat.id));
      if (!done) return;
      this.logger.log(`Story beat done: ${beat.key}`);
    }

    const next = await this.db.query.storyBeats.findFirst({
      where: and(eq(storyBeats.worldId, ctx.worldId), eq(storyBeats.status, 'pending')),
      orderBy: asc(storyBeats.position),
    });
    if (next) {
      await this.db
        .update(storyBeats)
        .set({ status: 'active', startedTick: ctx.tick + 1 })
        .where(eq(storyBeats.id, next.id));
      return;
    }
    // Takes a while: the next ticks run without a beat until it's ready.
    void this.writeNextBeat(ctx.worldId, ctx.player).catch((error: unknown) =>
      this.logger.warn(`Could not write the next story beat: ${String(error)}`),
    );
  }

  private async writeNextBeat(worldId: string, player: Account) {
    if (this.writing.has(worldId)) return;
    this.writing.add(worldId);
    try {
      const [world, cast, beats, feed, dms, storyRows] = await Promise.all([
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

      const prompt = [
        `השחקן: @${player.username} (${playerGender(player)})`,
        '',
        'הדמויות:',
        castText.join('\n\n'),
        '',
        'הסיפור עד עכשיו:',
        world.storySummary || 'עוד אין סיכום.',
        '',
        'פרקים אחרונים (מהישן לחדש):',
        ...(beatsText.length ? beatsText : ['אין עדיין.']),
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

      const text = await this.ai.generate(prompt, {
        system: directorSystem(player.username),
        hebrew: false,
        temperature: 0.9,
        maxTokens: 2000,
      });
      const beat = parseBeat(text, new Set(cast.map((c) => c.account.username)));
      const position = (beats[0]?.position ?? -1) + 1;

      await this.db.transaction(async (tx) => {
        await tx.insert(storyBeats).values({
          worldId,
          key: `director_${position}`,
          title: beat.title,
          description: beat.description,
          directions: beat.directions,
          position,
          status: 'active',
          startedTick: world.tick + 1,
        });
        await tx.update(worlds).set({ storySummary: beat.summary }).where(eq(worlds.id, worldId));
      });
      this.logger.log(`New story beat: ${beat.title} (${Object.keys(beat.directions).join(', ')})`);
    } finally {
      this.writing.delete(worldId);
    }
  }
}

function playerGender(player: Account) {
  if (player.gender === 'female') return 'אישה';
  if (player.gender === 'male') return 'גבר';
  return 'מגדר לא ידוע: לפנות בלשון רבים';
}

// Written in Hebrew like the other generation prompts. Agents never see the beat
// description or summary: they get only their own direction, so secrets stay secret
// until a character actually reveals them on the network.
const directorSystem = (player: string) => `התפקיד: לכתוב את העלילה של StatUs, רשת חברתית כמו אינסטגרם. כל החשבונות הם דמויות, חוץ מאדם אמיתי אחד: השחקן, @${player}. העלילה מתקדמת בפרקים קטנים, וכל פרק קורה ברשת עצמה.

מה דמות יכולה לעשות בפרק (רק את אלה):
- לפרסם פוסט: תמונה וכיתוב.
- לכתוב פוסט טקסט בלי תמונה: מחשבה, שאלה לחבורה, קיטור. טוב לשאלות פומביות ולעקיצות.
- להעלות סטורי: תמונה של רגע עכשווי עם כמה מילים עליה, נעלם אחרי יום. טוב לרמזים ולמצבי רוח. השחקן יכול להגיב לסטורי בהודעה פרטית.
- להגיב על פוסט של מישהו אחר (על סטורי אי אפשר להגיב).
- לשלוח הודעה פרטית לשחקן. דמויות לא שולחות הודעות פרטיות זו לזו.

כללים:
- כל פרק הוא צעד קטן אחד: 1 עד 3 דמויות, ולכל אחת פעולה אחת קונקרטית.
- לפחות בכל פרק שני, דמות פונה לשחקן ישירות בהודעה פרטית: מבקשת עצה, משתפת סוד, מבקשת שיבחר צד או שיעזור. השחקן הוא המקורב של כולם.
- להגיב למה שהשחקן עשה: עצה שנתן, צד שבחר, תגובה שכתב או הודעה שהתעלם ממנה. למעשים שלו יש השלכות.
- סודות נחשפים לאט: קודם רמזים, ורק אחר כך גילוי. לכל היותר סוד אחד בכל פרק.
- דרמה יומיומית ואמינה: אהבה, פרידות, חברויות, עבודה, כסף, רכילות, קנאה. בלי פשעים, אלימות, מחלות קשות או מוות.
- להמשיך את מה שכבר קרה בלי לסתור אותו. לפתוח קווי עלילה חדשים מהסודות והיחסים של הדמויות, ולא לחזור על אותו קו שוב ושוב.
- הוראה לפוסט או לסטורי אומרת על מה הוא ומה רואים בתמונה. הוראה לתגובה אומרת על הפוסט של מי.
- הכול בעברית, בלי צורות עם לוכסן ("את/ה").

התשובה: JSON בלבד, בלי שום טקסט לפניו או אחריו:
{
  "summary": "הסיפור עד עכשיו, מעודכן עם מה שקרה בפרקים האחרונים ובפוסטים ובהודעות. עד 10 משפטים.",
  "title": "כותרת קצרה לפרק החדש",
  "description": "מה קורה בפרק ולמה, 2 עד 3 משפטים.",
  "directions": {
    "<username>": "מה הדמות עושה, בשם הפועל, כהוראה אחת קונקרטית. למשל: לשלוח ל-@${player} הודעה ולשאול אם שם לב שמאיה מתרחקת מכולם"
  }
}`;

const beatSchema = z.object({
  summary: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  directions: z.record(z.string(), z.string().min(1)),
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
  return { ...beat, directions };
}
