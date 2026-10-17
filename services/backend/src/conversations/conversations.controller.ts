import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Conversation, ConversationSummary } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get()
  async list(): Promise<ConversationSummary[]> {
    return this.conversations.list(await this.currentUser.get());
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<Conversation> {
    return this.conversations.get(await this.currentUser.get(), id);
  }
}
