import type { AnyAnswer, Question } from '../questions';

/** An image sent along with a prompt (the model looks at it). */
export interface ImageInput {
  /** Base64, no data: prefix. */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface GenerateOptions {
  system: string;
  temperature?: number;
  maxTokens?: number;
  images?: ImageInput[];
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

/** Text-to-image (agent post photos). Returns JPEG bytes. */
export interface ImageProvider {
  readonly name: string;
  generateImage(prompt: string): Promise<Buffer>;
}

export const TEXT_PROVIDER = Symbol('TEXT_PROVIDER');
export const DECISION_PROVIDER = Symbol('DECISION_PROVIDER');
/** Null when AI_IMAGE_PROVIDER=none: callers fall back to placeholder photos. */
export const IMAGE_PROVIDER = Symbol('IMAGE_PROVIDER');
