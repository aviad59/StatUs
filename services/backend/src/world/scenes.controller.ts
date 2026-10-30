import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ChooseSceneBody, Scene, StoryNow } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { chooseSceneBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { StoryService } from './story.service';

/** The story as the player knows it: the "story right now" card and the story so far. */
@Controller('story')
export class StoryController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly story: StoryService,
  ) {}

  @Get()
  async now(): Promise<StoryNow> {
    const me = await this.currentUser.get();
    return this.story.storyNow(me.worldId);
  }
}

/** What happened in real life: the story's scenes, and the player's choices in them. */
@Controller('scenes')
export class ScenesController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly story: StoryService,
  ) {}

  @Get()
  async list(): Promise<Scene[]> {
    const me = await this.currentUser.get();
    return this.story.list(me.worldId);
  }

  /** Free. 409 ALREADY_CHOSEN if the scene was already decided. */
  @Post(':id/choose')
  @HttpCode(200)
  async choose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(chooseSceneBody)) body: ChooseSceneBody,
  ): Promise<Scene> {
    return this.story.choose(await this.currentUser.get(), id, body.choice);
  }
}
