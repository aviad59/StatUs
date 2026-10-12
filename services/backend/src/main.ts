import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('CORS_ORIGIN', 'http://localhost:5173') });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}/api`);
}

void bootstrap();
