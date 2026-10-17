import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [AccountsModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
