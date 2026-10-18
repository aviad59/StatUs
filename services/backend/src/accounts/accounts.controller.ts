import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { UpdateMeBody, User } from '@status/shared';
import { updateMeBody } from '../common/schemas';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentUserService } from './current-user.service';
import { toUser } from './to-user';

@Controller()
export class AccountsController {
  constructor(private readonly currentUser: CurrentUserService) {}

  @Get('me')
  async me(): Promise<User> {
    return toUser(await this.currentUser.get());
  }

  /** Profile settings. Agents use `gender` to address the user correctly in Hebrew. */
  @Patch('me')
  async update(@Body(new ZodBodyPipe(updateMeBody)) body: UpdateMeBody): Promise<User> {
    return toUser(await this.currentUser.update(body));
  }
}
