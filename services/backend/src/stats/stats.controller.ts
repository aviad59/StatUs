import { Controller, Get } from '@nestjs/common';
import type { PlayerStats } from '@status/shared';
import { CurrentUserService } from '../accounts/current-user.service';
import { StatsService } from './stats.service';

@Controller()
export class StatsController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly stats: StatsService,
  ) {}

  @Get('me/stats')
  async get(): Promise<PlayerStats> {
    return this.stats.get((await this.currentUser.get()).worldId);
  }
}
