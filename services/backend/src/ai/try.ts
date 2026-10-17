// Smoke test for the configured AI providers: `pnpm ai:try`.
// Runs one generate() and one of each decide() question type, and prints the results.

import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AiModule } from './ai.module';
import { AiService } from './ai.service';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule] })
class TryModule {}

const state = {
  character: {
    username: 'shira_bakes',
    persona: 'אופה חובבת מחיפה, חמה ומצחיקה, קצת עוקצנית כשמבקרים את המחמצת שלה.',
  },
  event: { type: 'comment', from: 'noam_levi', text: 'נראה שרוף לי 😬' },
  relationship: { with: 'noam_levi', score: -20 },
};

async function main() {
  const app = await NestFactory.createApplicationContext(TryModule, { logger: ['error'] });
  const ai = app.get(AiService);
  console.log('providers:', ai.providers);

  const time = async <T>(label: string, run: () => Promise<T>) => {
    const start = Date.now();
    const result = await run();
    console.log(`\n[${label}] ${Date.now() - start}ms`);
    console.log(result);
  };

  await time('generate', () =>
    ai.generate('כתבי כיתוב קצר לפוסט על כיכר לחם מחמצת שיצאה מושלמת.', {
      system: `את ${state.character.username}. ${state.character.persona}`,
      maxTokens: 200,
    }),
  );

  await time('decide: choice', () =>
    ai.decide(state, {
      type: 'choice',
      instructions: 'How does the character react to the comment?',
      options: {
        reply_playful: 'Reply with a playful jab',
        reply_angry: 'Reply defensively',
        ignore: 'Ignore it',
      },
    }),
  );

  await time('decide: score', () =>
    ai.decide(state, {
      type: 'score',
      instructions: 'How offended is the character by the comment?',
      levels: ['Not at all', 'A little', 'Clearly annoyed', 'Very hurt'],
    }),
  );

  await time('decide: yesNo', () =>
    ai.decide(state, {
      type: 'yesNo',
      instructions: 'Will the character DM the commenter about it?',
    }),
  );

  await app.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
