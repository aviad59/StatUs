import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TickErrorCode, TickEvent, TickResult, WorldStatus } from '@status/shared';
import { and, asc, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { accounts, characters, comments, posts, storyBeats, storyFlags, worlds } from '../db/schema';
import { AgentService, type TickContext } from './agent.service';
import { currentEnergy, energyConfig, type EnergyConfig, spendOne } from './energy';

type World = typeof worlds.$inferSelect;
type Account = typeof accounts.$inferSelect;

const FEED_SIZE = 10;
// A tick that has been "running" longer than this is assumed crashed, and the lock is taken over.
const STALE_TICK_MS = 5 * 60_000;
const MAX_POSTS_PER_TICK = 2;
// A beat counts as played out when the decision model is at least this sure.
const BEAT_DONE_THRESHOLD = 0.7;

const conflict = (code: TickErrorCode, message: string) => new ConflictException({ code, message });

@Injectable()
export class WorldService {
  private readonly logger = new Logger(WorldService.name);
  private readonly energy: EnergyConfig;
  private readonly maxActionsPerTick: number;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly agents: AgentService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.energy = energyConfig(config);
    this.maxActionsPerTick = Number(config.get('TICK_MAX_ACTIONS', 3));
  }

  async status(worldId: string): Promise<WorldStatus> {
    const world = await this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
    if (!world) throw new Error(`World ${worldId} not found`);
    return this.toStatus(world);
  }

  /**
   * Advances the world one step: each agent (in random order) may post, comment or
   * message the player, up to TICK_MAX_ACTIONS actions. Costs one energy point,
   * which is only spent if the tick succeeds.
   */
  async tick(player: Account): Promise<TickResult> {
    const [world] = await this.db
      .update(worlds)
      .set({ tickingSince: new Date() })
      .where(
        and(
          eq(worlds.id, player.worldId),
          or(isNull(worlds.tickingSince), lt(worlds.tickingSince, new Date(Date.now() - STALE_TICK_MS))),
        ),
      )
      .returning();
    if (!world) throw conflict('TICK_IN_PROGRESS', 'The world is already moving forward.');

    try {
      if (currentEnergy(world, this.energy).current < 1) {
        throw conflict('NO_ENERGY', 'Out of energy. Wait for it to regenerate.');
      }

      const events = await this.runAgents(world, player);
      const spent = spendOne(world, this.energy);
      const [updated] = await this.db
        .update(worlds)
        .set({ ...spent, tick: world.tick + 1, lastTickAt: new Date(), tickingSince: null })
        .where(eq(worlds.id, world.id))
        .returning();
      return { world: this.toStatus(updated), events };
    } finally {
      // Release the lock if the tick failed (no-op after a successful update).
      await this.db.update(worlds).set({ tickingSince: null }).where(eq(worlds.id, world.id));
    }
  }

  private async runAgents(world: World, player: Account): Promise<TickEvent[]> {
    const [ctx, cast] = await Promise.all([
      this.loadContext(world, player),
      this.db.query.characters.findMany({
        where: eq(characters.worldId, world.id),
        with: { account: true },
      }),
    ]);

    // One bad model response shouldn't sink the whole tick: log it and move on.
    let failures = 0;
    const failed = (character: (typeof cast)[number], error: unknown) => {
      failures++;
      this.logger.warn(`Turn failed for ${character.account.username}: ${String(error)}`);
      return null;
    };

    // 1. Everyone decides at once (the slow part is the AI and DB round trips).
    const plans = await Promise.all(
      cast.map((character) => this.agents.plan(ctx, character).catch((e: unknown) => failed(character, e))),
    );

    // 2. Act one at a time, so later agents see earlier ones' posts and comments.
    //    Replies the player is waiting for go first and don't count toward the cap.
    const ordered = shuffle(plans.filter((p) => p !== null && p.action !== 'nothing'));
    ordered.sort((a, b) => Number(b!.forced) - Number(a!.forced));

    const events: TickEvent[] = [];
    let spontaneous = 0;
    let newPosts = 0;
    for (const plan of ordered) {
      if (!plan!.forced && spontaneous >= this.maxActionsPerTick) break;
      // Leave room for comments: a tick of only posts feels like nobody talks to anyone.
      if (plan!.action === 'post' && newPosts >= MAX_POSTS_PER_TICK) continue;
      try {
        const event = await this.agents.act(ctx, plan!);
        if (event) events.push(event);
        if (!plan!.forced) spontaneous++;
        if (event?.type === 'post') newPosts++;
      } catch (error) {
        failed(plan!.character, error);
      }
    }
    if (cast.length && failures === cast.length) {
      throw new ServiceUnavailableException('Every agent turn failed. Is the AI provider running?');
    }

    await this.advanceStory(ctx, events).catch((error: unknown) =>
      this.logger.warn(`Story check failed: ${String(error)}`),
    );
    return events;
  }

  private async loadContext(world: World, player: Account): Promise<TickContext> {
    const [worldAccounts, feed, activeBeat, flags] = await Promise.all([
      this.db.query.accounts.findMany({ where: eq(accounts.worldId, world.id) }),
      this.db.query.posts.findMany({
        where: eq(posts.worldId, world.id),
        orderBy: desc(posts.createdAt),
        limit: FEED_SIZE,
        with: { author: true, comments: { orderBy: asc(comments.createdAt), with: { author: true } } },
      }),
      this.db.query.storyBeats.findFirst({
        where: and(eq(storyBeats.worldId, world.id), eq(storyBeats.status, 'active')),
      }),
      this.db.query.storyFlags.findMany({ where: eq(storyFlags.worldId, world.id) }),
    ]);

    return {
      worldId: world.id,
      tick: world.tick + 1,
      player,
      accountsById: new Map(worldAccounts.map((a) => [a.id, a])),
      feed: feed.map((p) => ({
        id: p.id,
        author: p.author,
        caption: p.caption,
        imageDescription: p.imageDescription,
        createdAt: p.createdAt,
        comments: p.comments.map((c) => ({ author: c.author, text: c.text })),
      })),
      activeBeat: activeBeat ?? null,
      flags: Object.fromEntries(flags.map((f) => [f.key, f.value])),
    };
  }

  /** Marks the active beat done once the agents have played it out, and starts the next one. */
  private async advanceStory(ctx: TickContext, events: TickEvent[]) {
    const beat = ctx.activeBeat;
    if (!beat || !events.length) return;

    const { yes } = await this.ai.decide(
      {
        beat: { title: beat.title, description: beat.description },
        whatHappenedThisTick: events.map((e) => `${e.actor.username} (${e.type}): ${e.text}`),
        recentFeed: ctx.feed.slice(0, 5).map((p) => ({
          author: p.author.username,
          caption: p.caption,
          comments: p.comments.slice(-3).map((c) => `${c.author.username}: ${c.text}`),
        })),
      },
      {
        type: 'yesNo',
        instructions: 'Has this story beat now been fully played out?',
        criteria: 'Yes only if the main thing the beat describes has visibly happened.',
      },
    );
    if (yes < BEAT_DONE_THRESHOLD) return;

    await this.db.transaction(async (tx) => {
      await tx
        .update(storyBeats)
        .set({ status: 'done', completedAt: new Date() })
        .where(eq(storyBeats.id, beat.id));
      const next = await tx.query.storyBeats.findFirst({
        where: and(eq(storyBeats.worldId, ctx.worldId), eq(storyBeats.status, 'pending')),
        orderBy: asc(storyBeats.position),
      });
      if (next) await tx.update(storyBeats).set({ status: 'active' }).where(eq(storyBeats.id, next.id));
    });
    this.logger.log(`Story beat done: ${beat.key}`);
  }

  private toStatus(world: World): WorldStatus {
    return {
      tick: world.tick,
      energy: currentEnergy(world, this.energy),
      dm: { messagesLeft: world.dmCredits, perEnergy: this.energy.dmMessages },
    };
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
