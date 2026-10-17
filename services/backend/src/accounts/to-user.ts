import type { User } from '@status/shared';
import type { accounts } from '../db/schema';

export const toUser = (account: typeof accounts.$inferSelect): User => ({
  id: account.id,
  username: account.username,
  name: account.name,
  avatarUrl: account.avatarUrl,
});
