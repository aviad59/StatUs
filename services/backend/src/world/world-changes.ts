import { Injectable } from '@nestjs/common';

/**
 * Tells WorldService when a world changed outside a tick, so it can prepare the next
 * tick again (see WorldService.prepare): the player commented, posted or sent a DM, an
 * agent's photo post finished uploading, the story director wrote a new beat.
 *
 * Purely a hint for speed. Ticks check a fingerprint of the world before using a
 * prepared tick, so a missed notification only makes that tick slower, never wrong.
 */
@Injectable()
export class WorldChanges {
  private readonly listeners = new Set<(worldId: string) => void>();
  /** Background jobs per world that will change it when they finish. */
  private readonly running = new Map<string, number>();

  changed(worldId: string) {
    for (const listener of this.listeners) listener(worldId);
  }

  onChange(listener: (worldId: string) => void) {
    this.listeners.add(listener);
  }

  /** Runs background work that changes the world (a photo post, a new story beat), and reports it when done. */
  async track<T>(worldId: string, work: () => Promise<T>): Promise<T> {
    this.running.set(worldId, (this.running.get(worldId) ?? 0) + 1);
    try {
      return await work();
    } finally {
      const left = (this.running.get(worldId) ?? 1) - 1;
      if (left > 0) this.running.set(worldId, left);
      else this.running.delete(worldId);
      this.changed(worldId);
    }
  }

  /** True while background work is still changing the world, so preparing now would be wasted. */
  busy(worldId: string) {
    return this.running.has(worldId);
  }
}
