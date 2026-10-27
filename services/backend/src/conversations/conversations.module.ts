import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { WorldModule } from '../world/world.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { StoryRepliesController } from './story-replies.controller';

@Module({
  imports: [AccountsModule, WorldModule],
  controllers: [ConversationsController, StoryRepliesController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
