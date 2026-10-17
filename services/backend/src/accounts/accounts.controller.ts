import { Controller, Get } from '@nestjs/common';
import type { User } from '@status/shared';
import { CurrentUserService } from './current-user.service';
import { toUser } from './to-user';

@Controller()
export class AccountsController {
  constructor(private readonly currentUser: CurrentUserService) {}

  @Get('me')
  async me(): Promise<User> {
    return toUser(await this.currentUser.get());
  }
}
