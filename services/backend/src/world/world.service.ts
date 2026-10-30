import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TickErrorCode, TickEvent, TickResult, WorldStatus } from '@status/shared';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { accounts, characters, comments, posts, scenes, storyBeats, storyFlags, worlds } from '../db/schema';
import {
  AgentService,
  type Draft,
  REAL_LIFE_IN_PROMPT,
  type TickContext,
  toRealLife,
  type TurnPlan,
} from './agent.service';
import { currentEnergy, energyConfig, type EnergyConfig, spendOne } from './energy';
import { beatDone, StoryService } from './story.service';
import { WorldChanges } from './world-changes';

type World = typeof worlds.$inferSelect;
type Account = typeof accounts.$inferSelect;

const FEED_SIZE = 10;
// A tick that has been "running" longer than this is assumed crashed, and the lock is taken over.
const STALE_TICK_MS = 5 * 60_000;
// Posts and stories (each draws a photo); the rest of the tick is left for comments and DMs.
const MAX_MEDIA_PER_TICK = 2;
// A prepared tick is thrown away after this long, so what the characters write still
// fits the moment (a "good morning" story shouldn't come out in the evening).
const PREPARED_MAX_AGE_MS = 15 * 60_000;
// After something changes, wait this long for more changes (a few comments or DMs in a
// row) before preparing the next tick again: each preparation costs AI calls.
const PREPARE_DEBOUNCE_MS = 2000;

const conflict = (code: TickErrorCode, message: string) => new ConflictException({ code, message });

/** A tick's turns, decided and written but not saved yet: the slow, AI part of a tick. */
interface Composed {
  ctx: TickContext;
  drafts: Draft[];
  /** For the "is the AI provider down?" check: turns that failed, out of the cast size. */
  failures: number;
  castSize: number;
  timings: string[];
}

/** A tick composed ahead of time, valid while the world still matches its fingerprint. */
interface Prepared {
  fingerprint: string;
  at: number;
  composed: Promise<Composed>;
}

@Injectable()
export class WorldService implements OnModuleDestroy {
  private readonly logger = new Logger(WorldService.name);
  private readonly energy: EnergyConfig;
  private readonly maxActionsPerTick: number;
  private readonly prepared = new Map<string, Prepared>();
  private readonly prepareTimers = new Map<string, NodeJS.Timeout>();
  /** Worlds whose preparation is being checked and started right now (a few DB reads), so two don't overlap. */
  private readonly preparing = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly agents: AgentService,
    private readonly story: StoryService,
    private readonly changes: WorldChanges,
    config: ConfigService,
  ) {
    this.energy = energyConfig(config);
    this.maxActionsPerTick = Number(config.get('TICK_MAX_ACTIONS', 3));
    changes.onChange((worldId) => this.schedulePrepare(worldId));
  }

  onModuleDestroy() {
    for (const timer of this.prepareTimers.values()) clearTimeout(timer);
  }

  /** Also starts preparing the next tick if there isn't one ready (the feed asks for this when it opens). */
  async status(worldId: string): Promise<WorldStatus> {
    const world = await this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
    if (!world) throw new Error(`World ${worldId} not found`);
    const ready = this.prepared.get(worldId);
    if (!ready || Date.now() - ready.at > PREPARED_MAX_AGE_MS) this.schedulePrepare(worldId, 0);
    return this.toStatus(world);
  }

  /**
   * Advances the world one step: each agent (in random order) may post, comment or
   * message the player, up to TICK_MAX_ACTIONS actions. Costs one energy point,
   * which is only spent if the tick succeeds.
   *
   * Usually the turns were already written in the background (prepare), and this only
   * saves them, which takes a moment. If the world changed since (the player commented,
   * say), they're written now instead, which takes a few seconds.
   */
  async tick(player: Account): Promise<TickResult> {
    const started = Date.now();
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

    let handedOff = false;
    try {
      if (currentEnergy(world, this.energy).current < 1) {
        throw conflict('NO_ENERGY', 'Out of energy. Wait for it to regenerate.');
      }

      const fingerprint = await this.fingerprint(world.id);
      const ready = this.takePrepared(world.id, fingerprint);
      // A preparation that failed, or lost turns to errors, is redone now: the network or
      // the AI provider was probably down for a moment, and a half-empty tick wastes energy.
      const prepared = ready && (await ready.then((c) => (c.failures ? null : c)).catch(() => null));
      const composed = prepared ?? (await this.compose(world, player));
      const { events, acted } = await this.commit(composed);

      // Spend the energy and count the tick now (still holding the lock); the story moves
      // on after the response, and the lock is released once it has (finish).
      const [updated] = await this.db
        .update(worlds)
        .set({ ...spendOne(world, this.energy), tick: world.tick + 1, lastTickAt: new Date() })
        .where(eq(worlds.id, world.id))
        .returning();
      handedOff = true;
      void this.finish(composed, acted);
      this.logger.log(
        `Tick ${composed.ctx.tick} took ${Date.now() - started}ms (${prepared ? 'prepared' : 'live'}): ` +
          composed.timings.join(', '),
      );
      // The next chapter (and usually a scene) is on its way when this beat just ended, or there was none.
      const { activeBeat } = composed.ctx;
      const storyMoving = !activeBeat || beatDone(activeBeat, composed.ctx.tick, acted, composed.ctx.awaitingChoice);
      return { world: this.toStatus(updated), events, storyMoving };
    } finally {
      if (!handedOff) await this.release(world.id);
    }
  }

  /** After a tick's response: moves the story on, then releases the lock and prepares the next tick. */
  private async finish({ ctx }: Composed, acted: string[]) {
    try {
      await this.story.advance(ctx, acted);
    } catch (error) {
      this.logger.warn(`Story update failed: ${String(error)}`);
    } finally {
      await this.release(ctx.worldId).catch((error: unknown) =>
        this.logger.warn(`Could not release the tick lock: ${String(error)}`),
      );
    }
  }

  /** Releases the tick lock, and gets the next tick ready while the player reads this one. */
  private async release(worldId: string) {
    await this.db.update(worlds).set({ tickingSince: null }).where(eq(worlds.id, worldId));
    this.schedulePrepare(worldId, 0);
  }

  /** The prepared tick, if it's for the world as it is now; it's used once either way. */
  private takePrepared(worldId: string, fingerprint: string): Promise<Composed> | null {
    const ready = this.prepared.get(worldId);
    this.prepared.delete(worldId);
    if (!ready || ready.fingerprint !== fingerprint || Date.now() - ready.at > PREPARED_MAX_AGE_MS) return null;
    return ready.composed;
  }

  /**
   * Everything the agents' turns depend on, as one string: the tick number, the newest
   * post, comment and DM, the active story beat (and who has played it), the flags. It
   * changes whenever anything a character would see changes. Agents only act in ticks,
   * so between ticks it only changes through the player or background work.
   */
  private async fingerprint(worldId: string): Promise<string> {
    const [row] = await this.db.execute(sql`
      select
        (select tick from ${worlds} where id = ${worldId}) as tick,
        (select max(created_at) from ${posts} where world_id = ${worldId}) as posts,
        (select max(c.created_at) from ${comments} c join ${posts} p on p.id = c.post_id
          where p.world_id = ${worldId}) as comments,
        (select max(m.created_at) from messages m join conversations v on v.id = m.conversation_id
          where v.world_id = ${worldId}) as messages,
        (select count(*) from conversations where world_id = ${worldId}) as conversations,
        (select id::text || ':' || array_to_string(acted_by, ',') from ${storyBeats}
          where world_id = ${worldId} and status = 'active') as beat,
        (select max(updated_at) from ${storyFlags} where world_id = ${worldId}) as flags,
        (select max(greatest(created_at, coalesce(chosen_at, created_at))) from ${scenes}
          where world_id = ${worldId}) as scenes,
        (select gender::text from ${accounts} where world_id = ${worldId} and kind = 'human'
          order by created_at limit 1) as player_gender
    `);
    return JSON.stringify(row);
  }

  /** Prepares the next tick soon, after changes stop for a moment. */
  private schedulePrepare(worldId: string, delay = PREPARE_DEBOUNCE_MS) {
    clearTimeout(this.prepareTimers.get(worldId));
    this.prepareTimers.set(
      worldId,
      setTimeout(() => {
        this.prepareTimers.delete(worldId);
        void this.prepare(worldId).catch((error: unknown) =>
          this.logger.warn(`Could not prepare the next tick: ${String(error)}`),
        );
      }, delay),
    );
  }

  /**
   * Composes the next tick in the background, so the player's next tick only has to
   * save it. Skipped while background work (a photo upload, the story director) is
   * still changing the world: it reports when it's done, and preparing starts then.
   */
  private async prepare(worldId: string) {
    if (this.changes.busy(worldId) || this.preparing.has(worldId)) return;
    this.preparing.add(worldId);
    try {
      await this.startPreparing(worldId);
    } finally {
      this.preparing.delete(worldId);
    }
  }

  private async startPreparing(worldId: string) {
    const [world, player] = await Promise.all([
      this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) }),
      this.db.query.accounts.findFirst({
        where: and(eq(accounts.worldId, worldId), eq(accounts.kind, 'human')),
        orderBy: asc(accounts.createdAt),
      }),
    ]);
    // Not while a tick runs (it prepares again when it's done), and not without energy to use it.
    if (!world || !player || world.tickingSince || currentEnergy(world, this.energy).current < 1) return;
    // No chapter going (the director failed last time)? Get one written first; preparing
    // waits for it, since the director's work is tracked (WorldChanges).
    await this.story.ensureBeat(worldId, player, world.tick);
    if (this.changes.busy(worldId)) return;

    const fingerprint = await this.fingerprint(worldId);
    const existing = this.prepared.get(worldId);
    if (existing?.fingerprint === fingerprint && Date.now() - existing.at < PREPARED_MAX_AGE_MS) return;

    const started = Date.now();
    const composed = this.compose(world, player);
    this.prepared.set(worldId, { fingerprint, at: started, composed });
    composed.then(
      (c) => this.logger.log(`Prepared tick ${c.ctx.tick} in ${Date.now() - started}ms: ${c.timings.join(', ')}`),
      (error: unknown) => this.logger.warn(`Preparing tick failed: ${String(error)}`),
    );
  }

  /**
   * The AI part of a tick, saving nothing: (1) every character plans at once, (2) the
   * turns that will run are picked, (3) they're all written at once.
   */
  private async compose(world: World, player: Account): Promise<Composed> {
    const timings: string[] = [];
    const lap = (label: string, since: number) => timings.push(`${label} ${Date.now() - since}ms`);
    const started = Date.now();
    const [ctx, cast] = await Promise.all([
      this.loadContext(world, player),
      this.db.query.characters.findMany({
        where: eq(characters.worldId, world.id),
        with: { account: true },
      }),
    ]);
    lap('context', started);

    // One bad model response shouldn't sink the whole tick: log it and move on.
    let failures = 0;
    const failed = (username: string, error: unknown) => {
      failures++;
      this.logger.warn(`Turn failed for ${username}: ${String(error)}`);
      return null;
    };

    const planning = Date.now();
    const plans = await Promise.all(
      cast.map((character) =>
        this.agents.plan(ctx, character).catch((e: unknown) => failed(character.account.username, e)),
      ),
    );
    lap('plan', planning);

    const writing = Date.now();
    const drafts = await Promise.all(
      this.pick(plans.filter((p) => p !== null)).map((plan) =>
        this.agents.compose(ctx, plan).catch((e: unknown) => failed(plan.character.account.username, e)),
      ),
    );
    lap('write', writing);

    return { ctx, drafts: drafts.filter((d) => d !== null), failures, castSize: cast.length, timings };
  }

  /**
   * Which turns run this tick. Replies the player is waiting for go first and don't
   * count toward the cap; then characters the story needs (they have a direction in the
   * active beat); then spontaneous ones in random order, up to TICK_MAX_ACTIONS, with at
   * most MAX_MEDIA_PER_TICK new posts and stories (a tick of only posts feels like
   * nobody talks to anyone).
   */
  private pick(plans: TurnPlan[]): TurnPlan[] {
    const rank = (plan: TurnPlan) => (plan.forced ? 2 : plan.direction ? 1 : 0);
    const ordered = shuffle(plans.filter((p) => p.action !== 'nothing')).sort((a, b) => rank(b) - rank(a));

    const picked: TurnPlan[] = [];
    let spontaneous = 0;
    let media = 0;
    for (const plan of ordered) {
      if (!plan.forced && spontaneous >= this.maxActionsPerTick) break;
      const isMedia = plan.action === 'post' || plan.action === 'story';
      if (isMedia && !plan.direction && media >= MAX_MEDIA_PER_TICK) continue;
      picked.push(plan);
      if (!plan.forced) spontaneous++;
      if (isMedia) media++;
    }
    return picked;
  }

  /**
   * Saves the composed turns: the moment they happen in the world. Returns the events,
   * and the directed characters who acted (for the story, see finish).
   */
  private async commit({ ctx, drafts, failures, castSize, timings }: Composed) {
    const started = Date.now();
    // In parallel; each one is a couple of quick inserts. Duplicate comments are caught
    // in saveComment before its first await, so they're still dropped.
    const results = await Promise.all(
      drafts.map((draft) =>
        this.agents.commit(ctx, draft).catch((e: unknown) => {
          failures++;
          this.logger.warn(`Saving a turn failed for ${draft.plan.character.account.username}: ${String(e)}`);
          return null;
        }),
      ),
    );
    if (castSize && failures >= castSize) {
      throw new ServiceUnavailableException('Every agent turn failed. Is the AI provider running?');
    }

    const events: TickEvent[] = results.filter((e) => e !== null);
    const acted = drafts
      .filter((draft, i) => results[i] && draft.plan.direction)
      .map((draft) => draft.plan.character.account.username);
    timings.push(`save ${Date.now() - started}ms`);
    return { events, acted };
  }

  private async loadContext(world: World, player: Account): Promise<TickContext> {
    const [worldAccounts, feed, activeBeat, flags, sceneRows] = await Promise.all([
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
      this.db.query.scenes.findMany({
        where: eq(scenes.worldId, world.id),
        orderBy: desc(scenes.createdAt),
        limit: REAL_LIFE_IN_PROMPT,
      }),
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
      realLife: toRealLife(sceneRows, player),
      // The active beat's scene asks the player something they haven't answered yet.
      awaitingChoice: sceneRows.some(
        (s) => activeBeat && s.beatId === activeBeat.id && s.choices.length > 0 && s.chosen === null,
      ),
    };
  }

  private toStatus(world: World): WorldStatus {
    return {
      tick: world.tick,
      energy: currentEnergy(world, this.energy),
      dm: { messagesLeft: world.dmCredits, perEnergy: this.energy.dmMessages },
      storyWriting: this.story.isWriting(world.id),
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
