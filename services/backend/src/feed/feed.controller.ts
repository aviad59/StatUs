import {
  Body,
  Controller,
  Get,
  Post as HttpPost,
  Param,
  ParseUUIDPipe,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  Comment,
  CreateCommentBody,
  CreatePostBody,
  LikeBody,
  LikeResult,
  Post,
  Profile,
  StoryGroup,
  User,
} from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { createPostBody, likeBody, textBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { FeedService, type UploadedImage } from './feed.service';

// Phones resize photos before uploading (see NewPostPage), so real uploads are far smaller.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

  /** The current user's own posts (their profile grid). */
  @Get('me/posts')
  async getMyPosts(): Promise<Post[]> {
    const me = await this.currentUser.get();
    return this.feed.getPosts(me.worldId, me.id);
  }

  /** multipart/form-data: `image` (JPEG, PNG or WebP; optional for a text-only post) and `caption`. */
  @HttpPost('posts')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async createPost(
    @UploadedFile() image: UploadedImage | undefined,
    @Body(new ZodBodyPipe(createPostBody)) body: CreatePostBody,
  ): Promise<Post> {
    return this.feed.createPost(await this.currentUser.get(), image, body.caption);
  }

  /** Everyone else in the user's world (the agents). */
  @Get('accounts')
  async getPeople(): Promise<User[]> {
    return this.feed.getPeople(await this.currentUser.get());
  }

  /** A profile page by username: bio and posts. */
  @Get('accounts/:username')
  async getProfile(@Param('username') username: string): Promise<Profile> {
    const me = await this.currentUser.get();
    return this.feed.getProfile(me.worldId, username);
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
