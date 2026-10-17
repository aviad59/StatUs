// Typed decision questions for AiService.decide(). They mirror TypeSafe Jev's three
// primitives (choice / score / noul), so Jev can answer them natively and the LLM
// providers emulate them with structured output.

export interface ChoiceQuestion<K extends string = string> {
  type: 'choice';
  instructions: string;
  /** Option key -> what choosing it means. The chosen key comes back in the answer. */
  options: Record<K, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  /** Ordered levels, lowest first. The answer maps them onto 0 (first) .. 1 (last). */
  levels: readonly string[];
}

export interface YesNoQuestion {
  type: 'yesNo';
  instructions: string;
  /** Optional clarification of what counts as yes and as no. */
  criteria?: string;
}

export type Question = ChoiceQuestion | ScoreQuestion | YesNoQuestion;

/** `confidence` is 0..1. LLM providers self-report it, so treat it as a rough signal. */
export interface ChoiceAnswer<K extends string = string> {
  choice: K;
  confidence: number;
}

export interface ScoreAnswer {
  /** 0 = first level, 1 = last level; can fall between levels. */
  score: number;
  confidence: number;
}

export interface YesNoAnswer {
  /** Probability that the answer is yes, 0..1. */
  yes: number;
}

export type AnyAnswer = ChoiceAnswer | ScoreAnswer | YesNoAnswer;

export type Answer<Q extends Question> =
  Q extends ChoiceQuestion<infer K>
    ? ChoiceAnswer<K>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : YesNoAnswer;
