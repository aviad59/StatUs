import { Inject, Injectable } from '@nestjs/common';
import {
  DECISION_PROVIDER,
  type DecisionProvider,
  TEXT_PROVIDER,
  type TextProvider,
} from './providers/provider';
import type { AnyAnswer, Answer, Question } from './questions';

/** Prepended to every generate() system prompt: all user-facing content is Hebrew. */
export const HEBREW_RULE =
  'Write only in natural, everyday Israeli Hebrew, as a real person would on social media. ' +
  'Never switch to English, except for usernames (which stay in Latin letters) and emoji.';

export interface GenerateOptions {
  /** Persona / task instructions. HEBREW_RULE is prepended automatically. */
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * The one entry point for AI calls. Providers are chosen by env vars
 * (AI_TEXT_PROVIDER, AI_DECISION_PROVIDER); see ai.module.ts.
 */
@Injectable()
export class AiService {
  constructor(
    @Inject(TEXT_PROVIDER) private readonly text: TextProvider,
    @Inject(DECISION_PROVIDER) private readonly decision: DecisionProvider,
  ) {}

  get providers() {
    return { text: this.text.name, decision: this.decision.name };
  }

  /** Free-form Hebrew text: posts, comments, DM replies. */
  generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const system = options.system ? `${HEBREW_RULE}\n\n${options.system}` : HEBREW_RULE;
    return this.text.generate(prompt, { ...options, system });
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
    const answer = await this.decision.decide(state, question);
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
