import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { CurrentUserService } from './current-user.service';

@Module({
  controllers: [AccountsController],
  providers: [CurrentUserService],
  exports: [CurrentUserService],
})
export class AccountsModule {}
