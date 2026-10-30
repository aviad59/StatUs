// The season's storyline: a funny Israeli roommates comedy, in acts. The story director
// (story.service.ts) writes the beats; this tells it where the season is going, so the
// small beats add up to one story the player is part of. Written for the seed cast
// (src/db/seed.ts) and in Hebrew, like the other prompts. Director-only: agents never
// see it, so the twists stay hidden until a character reveals them.
//
// Act 1 is scripted in the seed (its beats, scenes and the first choice), so every new
// world opens the same, clearly; a seeded world starts the director at act 2.

export interface Act {
  title: string;
  /** What has to happen in this act, for the director. */
  goal: string;
  /** The act ends between these many beats (the director says when its goal is met). */
  minBeats: number;
  maxBeats: number;
}

export interface Arc {
  title: string;
  /** The season in one line, as the player knows it (shown in the app). */
  logline: string;
  premise: string;
  /** What's really going on. Only the director knows it; it's revealed bit by bit. */
  truth: string;
  acts: Act[];
}

export const ARC: Arc = {
  title: '30 יום לפלורנטין',
  logline: 'בעל הבית מוכר את הדירה בעוד 30 יום. השותפים חייבים להציל אותה, ולא להרוג אחד את השנייה בדרך.',
  premise:
    'דירת שותפים בפלורנטין, תל אביב: קומה 3, בלי מעלית, מזגן אחד שכולם רבים עליו. ארבעה חדרים (אופיר, תמר, גל והשחקן) ' +
    'ושני בסלון הסגור, כי זה הכי זול. השחקן הוא השותף החדש, שעבר עכשיו לחדר הרביעי. בשבוע הראשון שלו שמוליק, בעל הבית, מודיע שהוא מוכר את הדירה בעוד 30 יום. השותפים, שלא מסוגלים להסכים אפילו ' +
    'על מי גמר את החלב, צריכים להתאחד כדי להציל את הדירה: להבריח קונים, למצוא כסף, לשכנע את רינה ואת ועד הבית, ולשרוד ' +
    'את הסודות של עצמם. השחקן הוא מי שכולם באים אליו: המתווך, הבלש והשופט של הדירה.',
  truth:
    'שמוליק לא באמת רוצה למכור: הוא גדל בדירה הזאת, והבנק לוחץ עליו להחזיר 60 אלף ש"ח מהלוואה עד סוף החודש. אם יהיה לו ' +
    'הכסף, או סיבה טובה, הוא נשאר. שני יודעת שהוא מוכר עוד לפני כולם, כי היא יוצאת בסתר עם אלעד, הבן שלו. אופיר הפסיד ' +
    'בקריפטו את 2,400 ש"ח של "הקופה המשותפת" שנועדו לארנונה, ומכתב התראה מהעירייה בדרך. תמר נרשמה בסתר לריאליטי ' +
    '"שותפים" של ערוץ קטן, וההפקה תשלם 60 אלף ש"ח דמי לוקיישן כדי לצלם חודש בדירה: זה הפתרון, אבל צריך שכל השותפים, ' +
    'שמוליק וועד הבית (רינה) יסכימו. רינה כותבת בשם עט רומנים רומנטיים על הדרמות של הדירה מעליה, והספר החדש שלה, ' +
    '"אהבה בקומה שלישית", עומד לצאת. גל, איש המילואים הקשוח, מפחד פחד מוות מג׳וקים.',
  acts: [
    {
      // Scripted in the seed: move-in, the fridge war, Shmulik's news, the first choice.
      title: 'ברוכים הבאים לדירה',
      goal: 'השחקן מכיר את השותפים, נקלע למלחמת המקרר, ושמוליק מודיע שהוא מוכר. נגמר בפגישת דירה ובבחירה מה עושים.',
      minBeats: 3,
      maxBeats: 3,
    },
    {
      title: 'בית פתוח',
      goal:
        'ביום שישי שמוליק עושה "בית פתוח" לקונים, ובראשם זוג מרעננה עם עגלה של 8,000 ש"ח. השותפים מתכננים איך להבריח ' +
        'אותם (לפי מה שהשחקן בחר בפגישה): ריח של דג, החתול של רינה, תמר בתור "שותפה מטורפת". בזמן הבית הפתוח ג׳וק מעופף ' +
        'נכנס למקלחת וגל מתגלה כמי שמפחד מהם, מול הקונים. שני רומזת שהיא יודעת למה שמוליק מוכר. בסוף המערכה: הקונים ' +
        'מתלבטים, ובחירה לשחקן מה עושים עכשיו.',
      minBeats: 3,
      maxBeats: 5,
    },
    {
      title: 'הכסף',
      goal:
        'מכתב התראה מהעירייה על חוב ארנונה מגיע, והסוד של אופיר מתגלה. מתברר (דרך שני) שלשמוליק חסרים 60 אלף ש"ח. ' +
        'החבורה מנסה לגייס כסף בדרכים מטורללות (פופ-אפ שקשוקה של גל, הרצאה של אופיר על "ניהול פיננסי"), ובסוף תמר ' +
        'מודה בסוד שלה: הריאליטי יכול לשלם את כל הסכום. הקשר של שני עם אלעד נחשף. בחירה לשחקן: ללכת על הריאליטי או לא.',
      minBeats: 3,
      maxBeats: 5,
    },
    {
      title: 'אסיפת ועד הבית',
      goal:
        'כדי לצלם בבניין צריך את ועד הבית, כלומר את רינה. אסיפה דרמטית בלובי עם כל הדיירים, בורקס ותלונות על החניה. ' +
        'מתגלה שרינה כותבת רומן על הדירה, וזה הופך לקלף מיקוח. בסוף: שיחה על הגג עם שמוליק, ובחירה לשחקן מה מציעים לו.',
      minBeats: 2,
      maxBeats: 4,
    },
    {
      title: 'החוזה',
      goal:
        'התוצאה: חתימה על חוזה חדש אצל רינה בסלון (עם בורקס), או פרידה מהדירה אם הכול השתבש. ההשלכות לכל אחד: הצילומים ' +
        'של תמר, הארנונה של אופיר, שני ואלעד, גל והג׳וקים, הספר של רינה, ושמוליק שנשאר. סוף חם ומצחיק, עם רמז להרפתקה הבאה.',
      minBeats: 2,
      maxBeats: 3,
    },
  ],
};

/** After the last act the director keeps going on its own, in the same spirit. */
export const AFTER_ARC =
  'העונה הראשונה ("30 יום לפלורנטין") הסתיימה. להמשיך את החיים בדירה, ומדי פעם לפתוח עלילה קטנה ומצחיקה חדשה ' +
  '(צו מילואים לגל, הצילומים של תמר, שותף חמישי שמופיע, חתונה של בת הדודה של שני), שנבנית מהסודות והיחסים של הדמויות.';

/** Where a seeded world starts the director: act 1 is the seed's own beats. */
export const FIRST_DIRECTED_ACT = 1;
