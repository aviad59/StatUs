import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { Conversation, ConversationSummary, Message, ReplyResult, SendMessageBody } from '@status/shared';
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

  /** The user opened the conversation: its messages are no longer unread. */
  @Put(':id/read')
  @HttpCode(204)
  async markRead(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.conversations.markRead(await this.currentUser.get(), id);
  }

  /** The agent answers the user's last message now (an AI call, a few seconds). */
  @Post(':id/reply')
  @HttpCode(200)
  async reply(@Param('id', ParseUUIDPipe) id: string): Promise<ReplyResult> {
    return { message: await this.conversations.reply(await this.currentUser.get(), id) };
  }
}
