import { Controller, Get } from '@nestjs/common';
import type { Post, StoryGroup } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
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
}
