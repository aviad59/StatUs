import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { StatsModule } from '../stats/stats.module';
import { WorldModule } from '../world/world.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [AccountsModule, StatsModule, WorldModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
