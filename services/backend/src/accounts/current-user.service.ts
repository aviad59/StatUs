import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { accounts } from '../db/schema';

/**
 * Resolves the human account making the request.
 *
 * TEMPORARY: there is no auth yet, so this returns the oldest human account
 * (the one `pnpm db:seed` creates). Replace with the Supabase Auth user once
 * login exists.
 */
@Injectable()
export class CurrentUserService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get() {
    const account = await this.db.query.accounts.findFirst({
      where: eq(accounts.kind, 'human'),
      orderBy: asc(accounts.createdAt),
    });
    if (!account) throw new NotFoundException('No user found. Run `pnpm db:seed`.');
    return account;
  }
}
