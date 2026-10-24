import { z } from 'zod';
import type { AnyAnswer, Question } from '../questions';
import { DECISION_SYSTEM, decisionPrompt, decisionSchema, toAnswer } from './llm-decision';
import type { DecisionProvider, GenerateOptions, TextProvider } from './provider';

interface OllamaChatResponse {
  message: { content: string };
}

/** Local models through Ollama's /api/chat (https://docs.ollama.com/api/chat). */
export class OllamaProvider implements TextProvider, DecisionProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {
    this.name = `ollama:${model}`;
  }

  generate(prompt: string, options: GenerateOptions): Promise<string> {
    return this.chat(
      options.system,
      prompt,
      { options: { temperature: options.temperature, num_predict: options.maxTokens } },
      options.images?.map((image) => image.data),
    );
  }

  async decide(state: unknown, question: Question): Promise<AnyAnswer> {
    const schema = decisionSchema(question);
    const content = await this.chat(DECISION_SYSTEM, decisionPrompt(state, question), {
      format: z.toJSONSchema(schema),
      options: { temperature: 0 },
    });
    return toAnswer(question, schema.parse(JSON.parse(content)));
  }

  // `images` (base64) only work with vision models, such as gemma4.
  private async chat(system: string, prompt: string, extra: Record<string, unknown>, images?: string[]) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        // Reasoning models (qwen3 etc.) otherwise spend most of the time thinking.
        think: false,
        // Keep the model in GPU memory between ticks; reloading it takes ~30 s.
        keep_alive: '30m',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt, images },
        ],
        ...extra,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as OllamaChatResponse;
    return data.message.content.trim();
  }
}
