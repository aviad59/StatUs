import { Body, Controller, Get, Param, ParseUUIDPipe, Post as HttpPost, Put } from '@nestjs/common';
import type { Comment, CreateCommentBody, LikeBody, LikeResult, Post, StoryGroup } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { likeBody, textBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { FeedService } from './feed.service';

@Controller()
export class FeedController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly feed: FeedService,
  ) {}

  @Get('feed')
  async getPosts(): Promise<Post[]> {
    const me = await this.currentUser.get();
    return this.feed.getPosts(me.worldId);
  }

  @Get('stories')
  async getStoryGroups(): Promise<StoryGroup[]> {
    const me = await this.currentUser.get();
    return this.feed.getStoryGroups(me.worldId);
  }

  @HttpPost('posts/:id/comments')
  async addComment(
    @Param('id', ParseUUIDPipe) postId: string,
    @Body(new ZodBodyPipe(textBody)) body: CreateCommentBody,
  ): Promise<Comment> {
    return this.feed.addComment(await this.currentUser.get(), postId, body.text);
  }

  @Put('posts/:id/like')
  async setLiked(
    @Param('id', ParseUUIDPipe) postId: string,
    @Body(new ZodBodyPipe(likeBody)) body: LikeBody,
  ): Promise<LikeResult> {
    return this.feed.setLiked(await this.currentUser.get(), postId, body.liked);
  }
}
