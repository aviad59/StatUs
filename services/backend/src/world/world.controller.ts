import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { TickResult, WorldStatus } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { WorldService } from './world.service';

@Controller('world')
export class WorldController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly world: WorldService,
  ) {}

  @Get()
  async status(): Promise<WorldStatus> {
    const me = await this.currentUser.get();
    return this.world.status(me.worldId);
  }

  /** 409 with `{ code: TickErrorCode }` when out of energy or a tick is already running. */
  @Post('tick')
  @HttpCode(200)
  async tick(): Promise<TickResult> {
    return this.world.tick(await this.currentUser.get());
  }
}
