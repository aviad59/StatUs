import type { AnyAnswer, Question } from '../questions';

export interface GenerateOptions {
  system: string;
  temperature?: number;
  maxTokens?: number;
}

/** Free-form text generation (posts, comments, DMs). */
export interface TextProvider {
  readonly name: string;
  generate(prompt: string, options: GenerateOptions): Promise<string>;
}

/** Typed decisions. AiService validates and normalizes whatever this returns. */
export interface DecisionProvider {
  readonly name: string;
  decide(state: unknown, question: Question): Promise<AnyAnswer>;
}

export const TEXT_PROVIDER = Symbol('TEXT_PROVIDER');
export const DECISION_PROVIDER = Symbol('DECISION_PROVIDER');
