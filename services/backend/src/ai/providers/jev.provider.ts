import type { AnyAnswer, Question } from '../questions';
import type { DecisionProvider } from './provider';

// TypeSafe Jev: a decision-only model (no text generation), in early access.
// API: https://docs.typesafe.ai/introduction/quickstart
// NOTE: written from the docs without an API key, so it hasn't been run yet.
// In particular, check the `score` range against the response's `legend`.

type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: readonly string[] }
  | { type: 'noul'; instructions: string; criteria?: string };

type JevAnswer =
  | { choice: string; confidence: number }
  | { score: number; confidence: number }
  | { noul: number };

const QUESTION_ID = 'q';

export class JevProvider implements DecisionProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.name = `jev:${model}`;
  }

  async decide(state: unknown, question: Question): Promise<AnyAnswer> {
    const response = await fetch(`${this.baseUrl}/systemone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        state,
        questions: { [QUESTION_ID]: toJevQuestion(question) },
      }),
    });
    if (!response.ok) {
      throw new Error(`Jev ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as { answers: Record<string, JevAnswer> };
    const answer = data.answers[QUESTION_ID];
    if ('noul' in answer) return { yes: answer.noul };
    return answer;
  }
}

function toJevQuestion(question: Question): JevQuestion {
  switch (question.type) {
    case 'choice':
      return { type: 'choice', instructions: question.instructions, criteria: question.options };
    case 'score':
      return { type: 'score', instructions: question.instructions, criteria: question.levels };
    case 'yesNo':
      return { type: 'noul', instructions: question.instructions, criteria: question.criteria };
  }
}
