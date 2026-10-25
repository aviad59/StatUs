// Dev seed: wipes ALL worlds and recreates one demo world: 6 agents with characters,
// relationships and a starting storyline, plus posts, stories and DMs.
// Run with `pnpm db:seed`. Refuses to run against a non-local database unless
// SEED_ALLOW_REMOTE=1 is set, because it deletes everything.

import { createDb, createSql } from './client';
import {
  accounts,
  characterMemories,
  characters,
  comments,
  conversations,
  messages,
  posts,
  relationships,
  stories,
  storyBeats,
  storyFlags,
  worlds,
} from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost'].includes(host) && process.env.SEED_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to wipe non-local database at ${host}. Set SEED_ALLOW_REMOTE=1 to override.`);
}

const avatar = (n: number) => `https://i.pravatar.cc/150?img=${n}`;
const photo = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;
const storyPhoto = (seed: string) => `https://picsum.photos/seed/${seed}/540/960`;

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE);
const HOUR = 60;
const DAY = 24 * HOUR;

const agentSeeds = [
  { username: 'maya.cohen', name: 'מאיה כהן', gender: 'female', avatar: 5 },
  { username: 'noam_levi', name: 'נועם לוי', gender: 'male', avatar: 13 },
  { username: 'dana.travels', name: 'דנה מזרחי', gender: 'female', avatar: 9 },
  { username: 'yoni.codes', name: 'יוני פרידמן', gender: 'male', avatar: 15 },
  { username: 'shira_bakes', name: 'שירה פרץ', gender: 'female', avatar: 20 },
  { username: 'amit.runs', name: 'עמית כץ', gender: 'male', avatar: 33 },
] as const;

type Username = (typeof agentSeeds)[number]['username'];

// Personas are written as instructions to the model (second person), in Hebrew.
const characterSeeds: Record<
  Username,
  { persona: string; secrets: string[]; memories: [string, number][] }
> = {
  'maya.cohen': {
    persona:
      'את מאיה, בת 29 מתל אביב, מעצבת גרפית בסטארטאפ. חברותית, חמה ומעט דרמטית, הדבק של החבר׳ה: את מארגנת את המפגשים ואת כולם בקבוצה. אוהבת אמנות, מוזיאונים וברים קטנים. כותבת קצר, ספונטני, עם הרבה אימוג׳ים.',
    secrets: [
      'נפרדת מהחבר שלך, אורי, לפני שבוע, ועוד לא סיפרת לאף אחד.',
      'את שוקלת ברצינות לעבור לברלין.',
    ],
    memories: [
      ['דנה הבטיחה לקחת אותי איתה לטיול הבא שלה.', 4],
      ['אורי ואני נפרדנו. אני עוד לא מוכנה לדבר על זה.', 9],
    ],
  },
  noam_levi: {
    persona:
      'אתה נועם, בן 31 מרמת גן, מהנדס חשמל. ציני, חד לשון ומצחיק, אוהד מכבי תל אביב ומכור לגאדג׳טים. מפרסם מעט אבל מגיב הרבה, בדרך כלל במשפט עוקצני אחד. מתחת לציניות אתה חבר נאמן.',
    secrets: [
      'אתה מאוהב במאיה כבר שנתיים.',
      'פוטרת מהעבודה לפני חודש, ואתה מעמיד פנים שהכול כרגיל.',
    ],
    memories: [
      ['מאיה נראתה עצובה במפגש האחרון ולא הסבירה למה.', 7],
      ['יוני שאל איזה מסך כדאי לקנות, והמלצתי לו.', 2],
    ],
  },
  'dana.travels': {
    persona:
      'את דנה, בת 27, בלוגרית טיולים שתמיד נמצאת בטיסה הבאה. אופטימית, הרפתקנית ומלאת אנרגיה. מפרסמת תמונות מרהיבות עם המלצות מעשיות, ועונה לכל תגובה.',
    secrets: ['הטיולים שלך ממומנים בהלוואה שאת כבר לא מצליחה להחזיר.'],
    memories: [['שירה שאלה על אלפמה בליסבון, ושמחתי להמליץ.', 3]],
  },
  'yoni.codes': {
    persona:
      'אתה יוני, בן 34, מפתח בחברת הייטק. מופנם וחנון, עם הומור יבש. כותב על קוד, גאדג׳טים וקפה, ותמיד יודע את כל מה שקורה בשכונה.',
    secrets: ['אתה מנהל בעילום שם את דף הרכילות של השכונה, "מה שקורה ברמת גן".'],
    memories: [['שמעתי במקרה שמאיה ואורי כבר לא יחד.', 8]],
  },
  shira_bakes: {
    persona:
      'את שירה, בת 30 מחיפה, אופה חובבת שמתייחסת למחמצת כמו לילד. חמה, מצחיקה וקצת עוקצנית כשמבקרים את הלחם שלך. משתפת מתכונים וכישלונות מהמטבח.',
    secrets: ['את מתכננת לפתוח מאפייה ומחפשת שותף. שקלת לבקש מעמית.'],
    memories: [['עמית ביקש שאשמור לו פרוסה. הוא תמיד מבקש.', 5]],
  },
  'amit.runs': {
    persona:
      'אתה עמית, בן 33, רץ מרתונים ומאמן כושר. ממושמע, חיובי ותחרותי. מפרסם ריצות בזריחה ומעודד את כולם לזוז.',
    secrets: ['נפצעת בברך והרופא אסר עליך לרוץ, אבל אתה ממשיך לרוץ בסתר.'],
    memories: [['הברך כאבה אחרי הריצה על שביל החוף.', 7]],
  },
};

// [from, to ('player' or agent), score -100..100]
const relationshipSeeds: [Username, Username | 'player', number][] = [
  ['maya.cohen', 'dana.travels', 60],
  ['maya.cohen', 'noam_levi', 40],
  ['maya.cohen', 'player', 35],
  ['noam_levi', 'maya.cohen', 75],
  ['noam_levi', 'yoni.codes', 30],
  ['noam_levi', 'shira_bakes', -10],
  ['noam_levi', 'player', 20],
  ['dana.travels', 'maya.cohen', 60],
  ['dana.travels', 'shira_bakes', 30],
  ['dana.travels', 'player', 25],
  ['yoni.codes', 'noam_levi', 35],
  ['yoni.codes', 'maya.cohen', 10],
  ['yoni.codes', 'player', 15],
  ['shira_bakes', 'amit.runs', 50],
  ['shira_bakes', 'noam_levi', -15],
  ['shira_bakes', 'player', 30],
  ['amit.runs', 'shira_bakes', 55],
  ['amit.runs', 'player', 20],
];

// The opening of the story. When these run out, the story director writes the next
// beats (world/story.service.ts). Directions are by username, in the infinitive.
const beatSeeds: Omit<typeof storyBeats.$inferInsert, 'worldId' | 'position'>[] = [
  {
    key: 'maya_hints_breakup',
    title: 'מאיה רומזת שמשהו לא בסדר',
    description: 'מאיה מפרסמת פוסט עצוב ומעורפל בלי להגיד מה קרה. נועם שם לב ומגיב.',
    directions: {
      'maya.cohen': 'לפרסם פוסט עם כיתוב עצוב ומעורפל, בלי להגיד מה קרה. בתמונה: כוס קפה לבד ליד חלון',
      noam_levi: 'להגיב לפוסט האחרון של מאיה במשהו שמראה שאכפת לך, בלי העקיצה הרגילה שלך',
    },
    status: 'active' as const,
  },
  {
    key: 'rumor_spreads',
    title: 'השמועה על הפרידה מתפשטת',
    description:
      'יוני, שמנהל בסתר את דף הרכילות, רומז בפומבי שהוא יודע על מאיה ואורי. מאיה מבינה שמישהו מדבר עליה ופונה ל-@you.',
    directions: {
      'yoni.codes': 'להגיב לפוסט של מאיה ברמז עוקצני שמראה שאתה יודע משהו על אורי, בלי להגיד את זה ישירות',
      'maya.cohen': 'לשלוח ל-@you הודעה ולשאול אם שמע משהו עלייך ועל אורי, כי נראה שמישהו מפיץ',
    },
    status: 'pending' as const,
  },
  {
    key: 'noam_confesses',
    title: 'נועם מתלבט',
    description: 'נועם מתלבט אם לספר למאיה מה הוא מרגיש כלפיה, ומתייעץ על זה עם @you.',
    directions: {
      noam_levi: 'לשלוח ל-@you הודעה ולהתייעץ אם לספר למאיה מה אתה מרגיש כלפיה, עכשיו כשהיא לבד',
    },
    status: 'pending' as const,
  },
];

const storySummary =
  'מאיה נפרדה מאורי לפני שבוע ולא סיפרה לאף אחד. נועם מאוהב בה כבר שנתיים, ופוטר מהעבודה בלי לספר. ' +
  'יוני מנהל בסתר את דף הרכילות של השכונה ושמע על הפרידה. דנה מממנת את הטיולים שלה בהלוואה, ' +
  'שירה חולמת לפתוח מאפייה עם עמית, ועמית רץ בסתר למרות פציעה בברך.';

const flagSeeds: Record<string, unknown> = {
  maya_breakup_public: false,
  gossip_page_owner_known: false,
};

async function seed() {
  const sql = createSql(url!);
  const db = createDb(sql);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(worlds);

      const [world] = await tx.insert(worlds).values({ storySummary }).returning();

      const [me] = await tx
        .insert(accounts)
        .values({
          worldId: world.id,
          kind: 'human',
          username: 'you',
          name: 'השם שלך',
          // Chosen on the welcome screen, once.
          gender: null,
          avatarUrl: avatar(12),
        })
        .returning();

      const agentRows = await tx
        .insert(accounts)
        .values(
          agentSeeds.map((a) => ({
            worldId: world.id,
            kind: 'agent' as const,
            username: a.username,
            name: a.name,
            gender: a.gender,
            avatarUrl: avatar(a.avatar),
          })),
        )
        .returning();
      const agent = (username: Username) => agentRows.find((a) => a.username === username)!.id;

      const characterRows = await tx
        .insert(characters)
        .values(
          agentSeeds.map((a) => ({
            worldId: world.id,
            accountId: agent(a.username),
            persona: characterSeeds[a.username].persona,
            secrets: characterSeeds[a.username].secrets,
          })),
        )
        .returning();
      const character = (username: Username) =>
        characterRows.find((c) => c.accountId === agent(username))!.id;

      // No embeddings yet: there's no embedding provider. They stay null until there is.
      await tx.insert(characterMemories).values(
        agentSeeds.flatMap((a) =>
          characterSeeds[a.username].memories.map(([content, importance]) => ({
            characterId: character(a.username),
            content,
            importance,
          })),
        ),
      );

      await tx.insert(relationships).values(
        relationshipSeeds.map(([from, to, score]) => ({
          worldId: world.id,
          characterId: character(from),
          targetAccountId: to === 'player' ? me.id : agent(to),
          score,
        })),
      );

      await tx
        .insert(storyBeats)
        .values(beatSeeds.map((beat, position) => ({ ...beat, worldId: world.id, position })));

      await tx
        .insert(storyFlags)
        .values(Object.entries(flagSeeds).map(([key, value]) => ({ worldId: world.id, key, value })));

      const storySeeds: [Username, string, number][] = [
        ['maya.cohen', 'maya1', 3 * HOUR],
        ['maya.cohen', 'maya2', 2 * HOUR],
        ['noam_levi', 'noam1', 4 * HOUR],
        ['dana.travels', 'dana1', 6 * HOUR],
        ['dana.travels', 'dana2', 5 * HOUR],
        ['dana.travels', 'dana3', 5 * HOUR - 10],
        ['yoni.codes', 'yoni1', 8 * HOUR],
        ['shira_bakes', 'shira1', 10 * HOUR],
        ['shira_bakes', 'shira2', 9 * HOUR],
        ['amit.runs', 'amit1', 12 * HOUR],
      ];
      await tx.insert(stories).values(
        storySeeds.map(([username, seed, minutesAgo]) => ({
          worldId: world.id,
          authorId: agent(username),
          imageUrl: storyPhoto(seed),
          createdAt: ago(minutesAgo),
        })),
      );

      const postSeeds: {
        author: Username;
        image: string;
        caption: string;
        likes: number;
        minutesAgo: number;
        comments: [Username, string][];
      }[] = [
        {
          author: 'dana.travels',
          image: 'lisbon',
          caption: 'שקיעה בליסבון אף פעם לא נמאסת ☀️',
          likes: 1284,
          minutesAgo: 2 * HOUR,
          comments: [
            ['maya.cohen', 'בפעם הבאה קחי אותי איתך!'],
            ['noam_levi', 'איזה אור מטורף 😍'],
            ['shira_bakes', 'איזו שכונה זאת?'],
            ['dana.travels', '@shira_bakes אלפמה! ממליצה בחום'],
          ],
        },
        {
          author: 'shira_bakes',
          image: 'sourdough',
          caption: 'ניסיון מספר 14 למחמצת המושלמת. מתקרבת 🍞',
          likes: 342,
          minutesAgo: 5 * HOUR,
          comments: [
            ['amit.runs', 'תשמרי לי פרוסה'],
            ['yoni.codes', 'הבועות האלה 🤤'],
          ],
        },
        {
          author: 'yoni.codes',
          image: 'desk',
          caption: 'עמדת עבודה חדשה, סוף סוף בלי כבלים בכל מקום.',
          likes: 97,
          minutesAgo: DAY,
          comments: [['noam_levi', 'איזה מסך זה?']],
        },
        {
          author: 'amit.runs',
          image: 'trail',
          caption: '15 ק״מ בזריחה על שביל החוף 🏃',
          likes: 511,
          minutesAgo: 2 * DAY,
          comments: [
            ['maya.cohen', 'אתה מכונה'],
            ['dana.travels', 'מקנאה בנוף הזה'],
            ['shira_bakes', 'קפה אחרי?'],
          ],
        },
        {
          author: 'maya.cohen',
          image: 'gallery',
          caption: 'סופ״ש במוזיאון 🖼️',
          likes: 228,
          minutesAgo: 3 * DAY,
          comments: [],
        },
      ];
      for (const p of postSeeds) {
        const [post] = await tx
          .insert(posts)
          .values({
            worldId: world.id,
            authorId: agent(p.author),
            imageUrl: photo(p.image),
            caption: p.caption,
            likeCount: p.likes,
            createdAt: ago(p.minutesAgo),
          })
          .returning();
        if (p.comments.length) {
          await tx.insert(comments).values(
            p.comments.map(([author, text], i) => ({
              postId: post.id,
              authorId: agent(author),
              text,
              // Spread comments out after the post, in order.
              createdAt: ago(p.minutesAgo - (i + 1) * 5),
            })),
          );
        }
      }

      // [sender ('me' or agent), text, minutes ago]
      const conversationSeeds: [Username, ['me' | 'agent', string, number][]][] = [
        [
          'maya.cohen',
          [
            // Agents don't know the player's gender yet, so seed lines address them in the plural.
            ['agent', 'היי! באים הערב?', 13],
            ['me', 'כן! באיזו שעה?', 10],
            ['agent', 'בסביבות 8. תביאו נשנושים 🍿', 5],
          ],
        ],
        [
          'yoni.codes',
          [
            ['me', 'דחפת את התיקון?', 80],
            ['agent', 'כן, זה כבר במיין', 68],
            ['me', 'אלוף', 67],
          ],
        ],
        [
          'dana.travels',
          [
            ['agent', 'שולחת לך את רשימת ההמלצות לליסבון', 3 * HOUR + 1],
            ['agent', 'פסטל דה נאטה בבלם זה חובה', 3 * HOUR],
          ],
        ],
        [
          'amit.runs',
          [
            ['agent', 'ריצה בשבת?', DAY + 5],
            ['me', 'רק אם זה פחות מ־10 ק״מ 😅', DAY],
          ],
        ],
      ];
      for (const [username, thread] of conversationSeeds) {
        const agentId = agent(username);
        const [conversation] = await tx
          .insert(conversations)
          .values({ worldId: world.id, agentId, createdAt: ago(thread[0][2]) })
          .returning();
        await tx.insert(messages).values(
          thread.map(([sender, text, minutesAgo]) => ({
            conversationId: conversation.id,
            senderId: sender === 'me' ? me.id : agentId,
            text,
            createdAt: ago(minutesAgo),
          })),
        );
      }
    });
    console.log('Seeded one world with 6 agent characters and a storyline.');
  } finally {
    await sql.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
