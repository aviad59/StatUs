import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AiModule } from './ai/ai.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DbModule } from './db/db.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AiModule,
    HealthModule,
    AccountsModule,
    FeedModule,
    ConversationsModule,
  ],
})
export class AppModule {}
