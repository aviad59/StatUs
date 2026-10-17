import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Conversation, ConversationSummary, Message, SendMessageBody } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { textBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
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

  @Post(':id/messages')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(textBody)) body: SendMessageBody,
  ): Promise<Message> {
    return this.conversations.send(await this.currentUser.get(), id, body.text);
  }
}
