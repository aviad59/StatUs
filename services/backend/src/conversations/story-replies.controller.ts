import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { SendMessageBody, StoryReplyResult } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { textBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { ConversationsService } from './conversations.service';

@Controller('stories')
export class StoryRepliesController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly conversations: ConversationsService,
  ) {}

  /** The user replies to an agent's story; the reply lands in their DM thread. */
  @Post(':id/reply')
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(textBody)) body: SendMessageBody,
  ): Promise<StoryReplyResult> {
    return this.conversations.replyToStory(await this.currentUser.get(), id, body.text);
  }
}
