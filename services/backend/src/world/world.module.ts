import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AgentService } from './agent.service';
import { ScenesController, StoryController } from './scenes.controller';
import { StoryService } from './story.service';
import { WorldChanges } from './world-changes';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [AccountsModule],
  controllers: [WorldController, ScenesController, StoryController],
  providers: [WorldService, AgentService, StoryService, WorldChanges],
  exports: [AgentService, WorldChanges],
})
export class WorldModule {}
