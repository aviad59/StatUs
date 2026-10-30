import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PlayerStats } from '@status/shared';
import { type AnyColumn, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { playerStats } from '../db/schema';
import { type PlayerAction, score } from './score';

const START = 50;

const toStats = (row: typeof playerStats.$inferSelect | undefined): PlayerStats => ({
  aura: row?.aura ?? START,
  humor: row?.humor ?? START,
  drama: row?.drama ?? START,
  last: row?.lastChange ? { ...row.lastChange, at: row.updatedAt.toISOString() } : null,
});

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** The same clamp in SQL, so concurrent actions add up without overshooting. */
const add = (column: AnyColumn, delta: number) =>
  sql`greatest(0, least(100, ${column} + ${delta}))`;

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async get(worldId: string): Promise<PlayerStats> {
    return toStats(await this.db.query.playerStats.findFirst({ where: eq(playerStats.worldId, worldId) }));
  }

  /**
   * Scores a player action and saves the change. Never throws: a stats hiccup
   * shouldn't fail the comment or DM it came from.
   */
  async record(worldId: string, action: PlayerAction): Promise<void> {
    const lastChange = score(action);
    try {
      await this.db
        .insert(playerStats)
        .values({
          worldId,
          aura: clamp(START + lastChange.aura),
          humor: clamp(START + lastChange.humor),
          drama: clamp(START + lastChange.drama),
          lastChange,
        })
        .onConflictDoUpdate({
          target: playerStats.worldId,
          set: {
            aura: add(playerStats.aura, lastChange.aura),
            humor: add(playerStats.humor, lastChange.humor),
            drama: add(playerStats.drama, lastChange.drama),
            lastChange,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      this.logger.warn(`Could not update the player's stats in world ${worldId}: ${String(error)}`);
    }
  }
}
