import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AgentService } from './agent.service';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [AccountsModule],
  controllers: [WorldController],
  providers: [WorldService, AgentService],
})
export class WorldModule {}
