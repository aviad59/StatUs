// "Pull" (פול): the made-up news site inside the app. Funny Israeli news, some of it a
// quiet echo of the season (rents in Florentin, the city chasing arnona, a reality show
// looking for a flat, a mystery romance novelist). Written here once; `pnpm news:generate`
// draws each article's photo in advance and writes the frontend's static news folder.
// Hebrew for what readers see, English for the image prompt (image models follow it best).

export interface Article {
  /** Stable id and photo file name. Changing it draws a new photo. */
  slug: string;
  category: string;
  title: string;
  subtitle: string;
  /** The article itself: 2 or 3 short sentences. */
  lead: string;
  /** How long ago it was "published", shown as relative time. */
  hoursAgo: number;
  /** What the photo shows. The shared news-photo style is added by the generator. */
  prompt: string;
}

export const ARTICLES: Article[] = [
  {
    slug: 'florentin-rent',
    category: 'נדל״ן',
    title: 'שכר הדירה בפלורנטין זינק ב-14%: "חדר בלי חלון זה עכשיו לופט"',
    subtitle: 'מתווכים בדרום תל אביב מדווחים על תורים לדירות שעוד לא נבנו',
    lead:
      'לפי נתוני הרבעון, חדר בדירת שותפים בפלורנטין עולה כבר יותר מדירה שלמה בבאר שבע. מתווך בשכונה סיפר ל-Pull ' +
      'שהשבוע השכיר "מחסן עם אופי" לשני סטודנטים. בעלי הדירות מצדם טוענים שהם "רק מתאימים את עצמם לשוק".',
    hoursAgo: 2,
    prompt:
      'An old apartment building in the Florentin neighborhood of Tel Aviv, colorful graffiti on the walls, laundry hanging ' +
      'from small balconies, air conditioner units, warm late afternoon light, seen from the street.',
  },
  {
    slug: 'arnona-whatsapp',
    category: 'עירוני',
    title: 'העירייה מחמירה: התראות על חוב ארנונה יישלחו מעכשיו גם בוואטסאפ',
    subtitle: 'בעירייה מסבירים: "כדי שאף אחד לא יוכל להגיד שלא ראה"',
    lead:
      'אחרי עלייה בחובות הארנונה בדירות שותפים, העירייה תשלח התראות גם בהודעה, ובמקרים חוזרים גם לקבוצת הבניין. ' +
      'בדירות רבות בעיר כבר מתחילים לברר מי בעצם אחראי על "הקופה המשותפת".',
    hoursAgo: 4,
    prompt:
      'A small pile of official-looking envelopes on a messy shared kitchen table next to a phone, a coffee mug and keys, ' +
      'morning light from a window.',
  },
  {
    slug: 'reality-flatmates',
    category: 'בידור',
    title: 'ריאליטי חדש מחפש דירת שותפים בתל אביב: "בלי מעלית זה בונוס"',
    subtitle: 'ההפקה מבטיחה דמי לוקיישן נדיבים. התנאי: כל הדיירים חייבים להסכים',
    lead:
      'ערוץ קטן מכין עונה ראשונה של "שותפים", שתצלם חודש שלם בדירה אמיתית. לפי ההפקה, כבר נרשמו מאות דירות, ' +
      'ו"הדרמה הכי טובה היא תמיד סביב המקרר". הצילומים צפויים להתחיל בקרוב.',
    hoursAgo: 6,
    prompt:
      'A small TV camera crew with a camera on a tripod and a boom microphone in the narrow stairwell of an old Tel Aviv ' +
      'apartment building, seen from behind.',
  },
  {
    slug: 'milk-study',
    category: 'צרכנות',
    title: 'מחקר חדש: 73% מהשותפים לא יודעים מי גמר את החלב',
    subtitle: 'ו-91% בטוחים שזה לא הם',
    lead:
      'הסקר, שנערך בקרב 1,200 דיירים בדירות שותפים, מצא שהחלב הוא מקור הוויכוח מספר אחת, לפני המזגן ותורנות הכלים. ' +
      'החוקרים ממליצים "לסמן כל דבר", ומודים שזה לא עוזר.',
    hoursAgo: 9,
    prompt:
      'An open fridge in a shared apartment with labeled shelves, sticky notes on food containers and an empty milk ' +
      'carton in the door, cool fridge light.',
  },
  {
    slug: 'cockroach-season',
    category: 'חדשות',
    title: 'עונת הג׳וקים המעופפים נפתחה רשמית: "השנה הם גדולים יותר"',
    subtitle: 'מדבירים מדווחים על עומס, ותושבים מספרים על "רגעים שלא נשכח"',
    lead:
      'עם תחילת החום, מוקדי ההדברה בגוש דן מקבלים מאות פניות ביום. "הכי הרבה מתקשרים גברים גדולים", סיפר מדביר ' +
      'ותיק, "הם תמיד מתחילים ב׳זה לא בשבילי, זה בשביל השותפה׳".',
    hoursAgo: 12,
    prompt:
      'A small tiled bathroom in an old apartment with a can of insect spray on the edge of the sink, flip-flops on the ' +
      'floor and the door half open, dramatic light.',
  },
  {
    slug: 'reserve-call',
    category: 'צבא',
    title: 'צווי מילואים לחורף כבר בדרך: "תתחילו להיפרד מהמזגן"',
    subtitle: 'בצה״ל מבטיחים שהפעם יהיו גם מקלחות חמות. המילואימניקים לא משוכנעים',
    lead:
      'אלפי מילואימניקים צפויים לקבל צו לתקופת החורף. בדירות שותפים כבר מתכוננים: מחלקים מחדש את התורנויות, ' +
      'ומתלבטים מי ישמור על המזגן על 24 בזמן שהמילואימניק בשטח.',
    hoursAgo: 20,
    prompt:
      'A packed olive green army duffel bag and boots by the front door of an apartment, a set of keys hanging on a hook, ' +
      'soft evening light.',
  },
  {
    slug: 'mystery-novelist',
    category: 'תרבות',
    title: 'סופרת אנונימית מתל אביב כובשת את רשימת רבי המכר',
    subtitle: 'הרומן "אהבה בקומה השנייה" מבוסס, לדבריה, "על אנשים אמיתיים מאוד"',
    lead:
      'הסופרת, שכותבת בשם עט, לא חשפה את זהותה, אבל רמזה שהיא גרה "בבניין עם הרבה דרמה ובלי מעלית". ' +
      'הספר הבא שלה צפוי לצאת בחודש הבא, ולפי ההוצאה "יהיה עוד יותר קרוב לבית".',
    hoursAgo: 28,
    prompt:
      'A neat stack of romance novels with pastel covers in a small bookstore window in Tel Aviv, a cat sleeping next to ' +
      'them, warm light.',
  },
  {
    slug: 'ayalon-record',
    category: 'תחבורה',
    title: 'פקק באיילון שבר שיא: "הספקתי לסיים תואר שני"',
    subtitle: 'נהגים מספרים על חברויות חדשות, פיקניקים ושני זוגות שהתארסו',
    lead:
      'הפקק נמשך יותר משלוש שעות לכיוון דרום, ונגמר, לפי עדי ראייה, "בלי שום סיבה נראית לעין". ' +
      'בנתיבי איילון מבטיחים לבדוק את העניין, ובינתיים ממליצים "להצטייד בסבלנות ובשתייה".',
    hoursAgo: 36,
    prompt:
      'A very long traffic jam on a multi-lane highway in Tel Aviv at sunset, red brake lights, office towers in the ' +
      'background, seen from a bridge above.',
  },
  {
    slug: 'night-shakshuka',
    category: 'אוכל',
    title: 'שקשוקה בשתיים בלילה: המגמה שכובשת את דירות השותפים',
    subtitle: 'שפים מזהירים: "12 ביצים לארבעה אנשים זה לא מתכון, זה אורח חיים"',
    lead:
      'יותר ויותר דירות שותפים מדווחות על "שקשוקה לילית" כטקס קבוע. לדברי חוקרת תרבות אוכל, "זה מה שמחזיק את ' +
      'הדירות האלה ביחד", ומי שלא מגיע, מקבל תורנות כלים.',
    hoursAgo: 44,
    prompt:
      'A big pan of shakshuka on a gas stove in a small apartment kitchen at night, steam rising, bread and four forks on ' +
      'the counter, warm light.',
  },
  {
    slug: 'vaad-rehearsals',
    category: 'שכונות',
    title: 'ועד בית בדרום העיר אסר על חזרות להצגות אחרי 23:00',
    subtitle: 'יו״ר הוועד: "אני בעד תרבות. אני גם בעד שינה. והחתול בעד שינה"',
    lead:
      'ההחלטה התקבלה באסיפת דיירים סוערת, אחרי תלונות על מונולוגים "דרמטיים מדי לשעה הזאת". ' +
      'דיירת שנפגעה מההחלטה הגיבה: "אמנות לא מסתיימת ב-23:00", ואז, לדבריה, "הלכה לישון".',
    hoursAgo: 60,
    prompt:
      'The entrance lobby of an old Tel Aviv apartment building with metal mailboxes, a potted plant and a ginger cat ' +
      'sitting on the stairs, evening light.',
  },
  {
    slug: 'crypto-arnona',
    category: 'כלכלה',
    title: 'הקריפטו צנח שוב, והשאלה הנפוצה בגוגל: "אפשר לשלם ארנונה במטבע שירד?"',
    subtitle: 'יועצים פיננסיים: "הקופה המשותפת של הדירה היא לא תיק השקעות"',
    lead:
      'הירידה החדה בשוק הקריפטו פגעה, לפי יועצים, גם בצעירים ש"רק רצו להגדיל קצת" את כספי ההוצאות המשותפות. ' +
      'ההמלצה: לספר לשותפים מוקדם, "לפני שהעירייה מספרת להם".',
    hoursAgo: 72,
    prompt:
      'A young man sitting alone on a small balcony at night looking at his phone, seen from behind, city lights of Tel ' +
      'Aviv in the background, a worried posture.',
  },
];

/** Added to every prompt so all photos read as one news site's: same look, same frame. */
export const NEWS_PHOTO_STYLE =
  'Professional news photograph, photojournalism, realistic, natural colors, sharp focus, editorial style, Israel. ' +
  'The main subject in the center of the frame (it is cropped to a wide 16:9). People only from behind or far away; ' +
  'no close-up faces. No text, no signs, no logos, no watermark.';
