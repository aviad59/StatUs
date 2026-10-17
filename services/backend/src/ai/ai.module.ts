import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { JevProvider } from './providers/jev.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { DECISION_PROVIDER, TEXT_PROVIDER } from './providers/provider';

// Provider selection (see .env.example):
//   AI_TEXT_PROVIDER     = ollama | anthropic
//   AI_DECISION_PROVIDER = ollama | anthropic | jev   (Jev can't generate text)

const ollama = (config: ConfigService) =>
  new OllamaProvider(
    config.get('OLLAMA_URL', 'http://localhost:11434'),
    config.get('OLLAMA_MODEL', 'qwen3:8b'),
  );

const anthropic = (config: ConfigService) =>
  new AnthropicProvider(
    config.getOrThrow('ANTHROPIC_API_KEY'),
    config.get('ANTHROPIC_MODEL', 'claude-opus-5-5'),
  );

const jev = (config: ConfigService) =>
  new JevProvider(
    config.get('JEV_BASE_URL', 'https://api.typesafe.ai/v1'),
    config.getOrThrow('TYPESAFE_API_KEY'),
    config.get('JEV_MODEL', 'jev-latest'),
  );

function unknownProvider(variable: string, value: string, allowed: string[]): never {
  throw new Error(`${variable}="${value}" is not supported. Use one of: ${allowed.join(', ')}`);
}

@Global()
@Module({
  providers: [
    {
      provide: TEXT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const name = config.get('AI_TEXT_PROVIDER', 'ollama');
        if (name === 'ollama') return ollama(config);
        if (name === 'anthropic') return anthropic(config);
        return unknownProvider('AI_TEXT_PROVIDER', name, ['ollama', 'anthropic']);
      },
    },
    {
      provide: DECISION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const name = config.get('AI_DECISION_PROVIDER', 'ollama');
        if (name === 'ollama') return ollama(config);
        if (name === 'anthropic') return anthropic(config);
        if (name === 'jev') return jev(config);
        return unknownProvider('AI_DECISION_PROVIDER', name, ['ollama', 'anthropic', 'jev']);
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
