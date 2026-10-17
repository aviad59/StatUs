// Shared by the LLM providers (Ollama, Anthropic) to emulate Jev-style decisions with
// structured output. The schemas stay loose (no numeric bounds) because not every
// structured-output backend supports them; AiService clamps the result afterwards.

import { z } from 'zod';
import type { AnyAnswer, Question } from '../questions';

export function decisionSchema(question: Question) {
  switch (question.type) {
    case 'choice': {
      const keys = Object.keys(question.options) as [string, ...string[]];
      return z.object({ choice: z.enum(keys), confidence: z.number() });
    }
    case 'score':
      return z.object({ level: z.number(), confidence: z.number() });
    case 'yesNo':
      return z.object({ yes: z.number() });
  }
}

export type DecisionOutput = z.infer<ReturnType<typeof decisionSchema>>;

export const DECISION_SYSTEM = [
  'You make decisions for characters in an ongoing social-network story simulation.',
  'You receive the current STATE (JSON) and one QUESTION. Answer only from the state;',
  'stay consistent with each character persona, relationships and story flags.',
  'Reply with JSON only, matching the requested schema.',
].join(' ');

export function decisionPrompt(state: unknown, question: Question): string {
  const lines = [`STATE:\n${JSON.stringify(state, null, 2)}`, '', `QUESTION: ${question.instructions}`];

  switch (question.type) {
    case 'choice':
      lines.push('', 'OPTIONS (answer with the key):');
      for (const [key, description] of Object.entries(question.options)) {
        lines.push(`- ${key}: ${description}`);
      }
      lines.push('', 'Set "confidence" between 0 and 1.');
      break;
    case 'score':
      lines.push('', 'LEVELS (answer with the level number):');
      question.levels.forEach((level, i) => lines.push(`${i}. ${level}`));
      lines.push('', 'Set "level" to the best-matching number and "confidence" between 0 and 1.');
      break;
    case 'yesNo':
      if (question.criteria) lines.push('', `CRITERIA: ${question.criteria}`);
      lines.push('', 'Set "yes" to the probability (0 to 1) that the answer is yes.');
      break;
  }
  return lines.join('\n');
}

/** Converts the structured output into an answer (score levels become 0..1). */
export function toAnswer(question: Question, output: DecisionOutput): AnyAnswer {
  if (question.type === 'score' && 'level' in output) {
    const last = question.levels.length - 1;
    return { score: last > 0 ? output.level / last : 0, confidence: output.confidence };
  }
  return output as AnyAnswer;
}
