import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { AnyAnswer, Question } from '../questions';
import { DECISION_SYSTEM, decisionPrompt, decisionSchema, toAnswer } from './llm-decision';
import type { DecisionProvider, GenerateOptions, TextProvider } from './provider';

// Server-side fallback: if the model declines a request, the API retries it on a
// fallback model chosen by refusal category, inside the same call.
const fallback = () => ({
  betas: ['server-side-fallback-2026-07-01' as const],
  fallbacks: 'default' as const,
});

/** Claude through the Anthropic API. */
export class AnthropicProvider implements TextProvider, DecisionProvider {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.name = `anthropic:${model}`;
    this.client = new Anthropic({ apiKey });
  }

  async generate(prompt: string, options: GenerateOptions): Promise<string> {
    const response = await this.client.beta.messages.create({
      ...fallback(),
      model: this.model,
      // Not options.maxTokens: thinking tokens count toward max_tokens on current Claude
      // models, so a small cap cuts the text off mid-word. Length is set by the prompt.
      max_tokens: 4096,
      // Short creative writing: low effort keeps latency and cost down.
      output_config: { effort: 'low' },
      system: options.system,
      messages: [
        {
          role: 'user',
          content: [
            ...(options.images ?? []).map((image) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`Claude declined to generate (${response.stop_details?.category ?? 'unknown'})`);
    }
    // Never publish half a sentence.
    if (response.stop_reason === 'max_tokens') throw new Error('Claude hit max_tokens; text was cut off');
    return response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
  }

  async decide(state: unknown, question: Question): Promise<AnyAnswer> {
    const response = await this.client.beta.messages.parse({
      ...fallback(),
      model: this.model,
      max_tokens: 4096, // includes thinking; see generate()
      output_config: { effort: 'low', format: betaZodOutputFormat(decisionSchema(question)) },
      system: DECISION_SYSTEM,
      messages: [{ role: 'user', content: decisionPrompt(state, question) }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error(`Claude returned no decision (stop_reason: ${response.stop_reason})`);
    }
    return toAnswer(question, response.parsed_output);
  }
}
