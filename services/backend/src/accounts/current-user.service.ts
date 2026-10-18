import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { accounts } from '../db/schema';

type Account = typeof accounts.$inferSelect;

// Every request needs the current user, and each DB round trip can cost ~300 ms, so
// it's cached briefly. After a reseed, the old account is served for up to this long.
const CACHE_MS = 60_000;

/**
 * Resolves the human account making the request.
 *
 * TEMPORARY: there is no auth yet, so this returns the oldest human account
 * (the one `pnpm db:seed` creates). Replace with the Supabase Auth user once
 * login exists.
 */
@Injectable()
export class CurrentUserService {
  private cached: { account: Promise<Account>; expires: number } | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  get(): Promise<Account> {
    if (!this.cached || this.cached.expires < Date.now()) {
      const account = this.load();
      // Don't cache failures (e.g. an empty DB before seeding).
      account.catch(() => (this.cached = null));
      this.cached = { account, expires: Date.now() + CACHE_MS };
    }
    return this.cached.account;
  }

  private async load(): Promise<Account> {
    const account = await this.db.query.accounts.findFirst({
      where: eq(accounts.kind, 'human'),
      orderBy: asc(accounts.createdAt),
    });
    if (!account) throw new NotFoundException('No user found. Run `pnpm db:seed`.');
    return account;
  }
}
