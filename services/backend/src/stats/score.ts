// How each player action moves their stats. Pure and AI-free on purpose: it runs on
// every like, comment, post and DM, so it costs nothing but a DB write.

export type PlayerAction =
  | { kind: 'photo_post'; text: string }
  | { kind: 'text_post'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'dm'; text: string; doubleText: boolean; storyReply: boolean }
  | { kind: 'like' }
  | { kind: 'unlike' };

export interface StatsDelta {
  aura: number;
  humor: number;
  drama: number;
  /** Hebrew, gender-neutral: shown to the user next to the change. */
  reason: string;
}

type Stat = 'aura' | 'humor' | 'drama';
const STATS: Stat[] = ['aura', 'humor', 'drama'];

/** No single action moves a stat by more than this. */
const MAX_STEP = 10;

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

const LAUGH = /ח{3,}|ה{3,}|😂|🤣|😹|😆|\blol\b|\bxd\b/giu;
const PLAYFUL = /😜|🤪|😅|🙃|😏|סתם|צוחק|צוחקת|בדיחה/gu;
const DRAMA_WORDS =
  /סוד|שקר|שיקר|בגד|בגידה|ריב|דרמה|לעזאזל|אין מצב|נשבע|נשבעת|חצו[ףפ]|תודה רבה באמת|\bwtf\b|\bomg\b/giu;
const DRAMA_EMOJI = /😱|😡|🤬|💔|🔥|👀|🍿|😤/gu;
const LOUD_PUNCTUATION = /!{2,}|\?!|!\?/g;
const SHOUTING = /\b[A-Z]{3,}\b/g;
const COOL = /😎|🕶|💅|👑|אחי|סבבה|יאללה/gu;
const APOLOGY = /סליחה|מצטער|מצטערת|סורי|\bsorry\b/giu;
const EMOJI = /\p{Extended_Pictographic}/gu;

/** The change one action makes, before clamping the stats to 0..100. */
export function score(action: PlayerAction, random: () => number = Math.random): StatsDelta {
  const d = { aura: 0, humor: 0, drama: 0 };
  // Why it changed, strongest first; the top one is shown.
  const reasons: [weight: number, text: string][] = [];

  switch (action.kind) {
    case 'photo_post':
      d.aura += 4;
      reasons.push([3, 'פוסט חדש עם תמונה']);
      break;
    case 'text_post':
      d.aura += 1;
      d.humor += 1;
      reasons.push([1, 'פוסט חדש']);
      break;
    case 'comment':
      d.drama += 1;
      reasons.push([1, 'תגובה בפיד']);
      break;
    case 'dm':
      if (action.doubleText) {
        d.aura -= 4;
        reasons.push([5, 'דאבל טקסט']);
      }
      if (action.storyReply) {
        d.drama += 1;
        reasons.push([1, 'תגובה לסטורי']);
      }
      reasons.push([0, 'הודעה פרטית']);
      break;
    case 'like':
      // Liking everything is a little needy.
      d.aura -= 1;
      reasons.push([1, 'לייק']);
      break;
    case 'unlike':
      d.aura += 1;
      d.drama += 2;
      reasons.push([2, 'ביטול לייק, עקיצה']);
      break;
  }

  if ('text' in action) {
    const text = action.text;
    const laughs = Math.min(count(text, LAUGH), 2);
    const playful = Math.min(count(text, PLAYFUL), 2);
    const drama = Math.min(count(text, DRAMA_WORDS) + count(text, DRAMA_EMOJI), 3);
    const loud = Math.min(count(text, LOUD_PUNCTUATION) + count(text, SHOUTING), 2);
    const emojis = count(text, EMOJI);

    d.humor += laughs * 3 + playful * 2;
    if (laughs || playful) reasons.push([laughs * 3 + playful * 2, 'הומור']);
    d.drama += drama * 2 + loud * 2;
    if (drama || loud) reasons.push([drama * 2 + loud * 2, 'מבעיר את המצב']);

    if (count(text, COOL)) {
      d.aura += 2;
      reasons.push([2, 'וייב קול']);
    }
    if (count(text, APOLOGY)) {
      d.aura -= 2;
      reasons.push([2, 'יותר מדי התנצלויות']);
    }
    if (text.length > 220) {
      d.aura -= 3;
      d.humor -= 1;
      reasons.push([3, 'חפירה']);
    } else if (text.length > 0 && text.length <= 40 && !text.includes('?')) {
      d.aura += 2;
      reasons.push([1, 'קצר ובטוח']);
    }
    if (emojis > 4) {
      d.aura -= 2;
      reasons.push([2, 'הצפת אימוג׳ים']);
    }
    if (count(text, /\?/g) >= 3) d.aura -= 1;
  }

  // A little noise, so the same move doesn't always land the same way.
  for (const stat of STATS) d[stat] += Math.floor(random() * 3) - 1;
  // Every action moves something.
  if (STATS.every((stat) => d[stat] === 0)) {
    d[STATS[Math.floor(random() * STATS.length)]] += random() < 0.5 ? -1 : 1;
  }
  for (const stat of STATS) d[stat] = Math.max(-MAX_STEP, Math.min(MAX_STEP, d[stat]));

  reasons.sort((a, b) => b[0] - a[0]);
  return { ...d, reason: reasons[0][1] };
}
