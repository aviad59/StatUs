import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DECISION_PROVIDER,
  type DecisionProvider,
  IMAGE_PROVIDER,
  type ImageInput,
  type ImageProvider,
  TEXT_PROVIDER,
  type TextProvider,
} from './providers/provider';
import type { AnyAnswer, Answer, Question } from './questions';

/**
 * Prepended to every generate() system prompt: all user-facing content is Hebrew.
 * Written in Hebrew, with examples, because English instructions make models write
 * Hebrew that reads like a translation.
 */
export const HEBREW_RULE = `כל מה שכותבים הוא בעברית ישראלית מדוברת, כמו שאנשים אמיתיים כותבים באינסטגרם ובוואטסאפ.
- לכתוב רק את הטקסט עצמו, גרסה אחת. בלי הקדמה, בלי כמה אפשרויות לבחירה ובלי הסברים: מה שנכתב מתפרסם כמו שהוא.
- קצר וישיר. משפטים קצרים, ולא חייב פיסוק מושלם.
- סלנג טבעי כשזה מתאים (סבבה, וואלה, חחח, יאללה), אבל לא בכל משפט.
- אף פעם לא לכתוב צורות עם לוכסן כמו "את/ה" או "בא/ה". לבחור צורה אחת, לפי מי שמדברים עליו.
- לא לכתוב כמו תרגום מאנגלית ולא כמו עוזר וירטואלי. בלי "אני רואה ש...", "זה נשמע מדהים!", "אני כאן בשבילך", "איך זה גורם לך להרגיש?".
- לא לחזור על מה שהצד השני אמר, ולא לתאר רגשות בצורה מפורשת מדי.
- אימוג׳י רק לפעמים, לכל היותר שניים.
- שמות משתמש נשארים באותיות לטיניות (למשל @maya.cohen).

דוגמאות לטון טבעי: "חחח אל תתחיל", "וואלה? לא ידעתי, מה קרה?", "איזה יופי של תמונה", "יאללה נדבר מחר", "מה נסגר איתך היום"
דוגמאות למה לא לכתוב: "אני רואה שאת מרגישה עצובה, אני כאן בשבילך!", "זו נשמעת כמו חוויה מדהימה ומעשירה!"`;

export interface GenerateOptions {
  /** Persona / task instructions. HEBREW_RULE is prepended automatically. */
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Images for the model to look at along with the prompt. */
  images?: ImageInput[];
  /** False for text that isn't shown to users (e.g. English image prompts): skips HEBREW_RULE. */
  hebrew?: boolean;
}

/**
 * The one entry point for AI calls. Providers are chosen by env vars
 * (AI_TEXT_PROVIDER, AI_DECISION_PROVIDER); see ai.module.ts.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(TEXT_PROVIDER) private readonly text: TextProvider,
    @Inject(DECISION_PROVIDER) private readonly decision: DecisionProvider,
    @Inject(IMAGE_PROVIDER) private readonly image: ImageProvider | null,
  ) {}

  get providers() {
    return { text: this.text.name, decision: this.decision.name, image: this.image?.name ?? 'none' };
  }

  /** Free-form Hebrew text: posts, comments, DM replies. */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const { hebrew = true, ...rest } = options;
    const system = [hebrew ? HEBREW_RULE : '', options.system ?? ''].filter(Boolean).join('\n\n');
    const started = Date.now();
    try {
      return await this.text.generate(prompt, { ...rest, system });
    } finally {
      this.logger.debug(`generate ${Date.now() - started}ms`);
    }
  }

  /** A JPEG from an English prompt, or null when no image provider is configured. */
  generateImage(prompt: string): Promise<Buffer> | null {
    return this.image?.generateImage(prompt) ?? null;
  }

  /**
   * A typed decision about `state` (any JSON-serializable value). The answer type
   * follows the question: a choice question returns one of its own option keys.
   *
   * @example
   * const { choice } = await ai.decide(state, {
   *   type: 'choice',
   *   instructions: 'How should Maya react to the comment?',
   *   options: { reply: 'Answer it', like: 'Just like it', ignore: 'Do nothing' },
   * }); // choice: 'reply' | 'like' | 'ignore'
   */
  async decide<const Q extends Question>(state: unknown, question: Q): Promise<Answer<Q>> {
    const started = Date.now();
    const answer = await this.decision.decide(state, question);
    this.logger.debug(`decide ${question.type} ${Date.now() - started}ms`);
    return normalize(question, answer) as Answer<Q>;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function normalize(question: Question, answer: AnyAnswer): AnyAnswer {
  switch (question.type) {
    case 'choice':
      if (!('choice' in answer) || !(answer.choice in question.options)) {
        throw new Error(`Decision returned an unknown choice: ${JSON.stringify(answer)}`);
      }
      return { choice: answer.choice, confidence: clamp01(answer.confidence) };
    case 'score':
      if (!('score' in answer)) throw new Error(`Expected a score: ${JSON.stringify(answer)}`);
      return { score: clamp01(answer.score), confidence: clamp01(answer.confidence) };
    case 'yesNo':
      if (!('yes' in answer)) throw new Error(`Expected a yes/no: ${JSON.stringify(answer)}`);
      return { yes: clamp01(answer.yes) };
  }
}
