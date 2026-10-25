import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { CloudflareImageProvider } from './providers/cloudflare.provider';
import { JevProvider } from './providers/jev.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { DECISION_PROVIDER, IMAGE_PROVIDER, TEXT_PROVIDER } from './providers/provider';

// Provider selection (see .env.example):
//   AI_TEXT_PROVIDER     = ollama | anthropic
//   AI_DECISION_PROVIDER = ollama | anthropic | jev   (Jev can't generate text)
//   AI_IMAGE_PROVIDER    = none | cloudflare           (none: placeholder photos)

const ollama = (config: ConfigService) =>
  new OllamaProvider(
    config.get('OLLAMA_URL', 'http://localhost:11434'),
    config.get('OLLAMA_MODEL', 'gemma4:12b'),
  );

const anthropic = (config: ConfigService, model = config.get('ANTHROPIC_MODEL', 'claude-opus-5-5')) =>
  new AnthropicProvider(config.getOrThrow('ANTHROPIC_API_KEY'), model);

// Decisions are many short choices per tick: a smaller, faster model can run them.
const anthropicDecisions = (config: ConfigService) =>
  anthropic(config, config.get('ANTHROPIC_DECISION_MODEL') || undefined);

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
        if (name === 'anthropic') return anthropicDecisions(config);
        if (name === 'jev') return jev(config);
        return unknownProvider('AI_DECISION_PROVIDER', name, ['ollama', 'anthropic', 'jev']);
      },
    },
    {
      provide: IMAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const name = config.get('AI_IMAGE_PROVIDER', 'none');
        if (name === 'none') return null;
        if (name === 'cloudflare') {
          return new CloudflareImageProvider(
            config.getOrThrow('CLOUDFLARE_ACCOUNT_ID'),
            config.getOrThrow('CLOUDFLARE_API_TOKEN'),
            config.get('CLOUDFLARE_IMAGE_MODEL', '@cf/black-forest-labs/flux-1-schnell'),
          );
        }
        return unknownProvider('AI_IMAGE_PROVIDER', name, ['none', 'cloudflare']);
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
