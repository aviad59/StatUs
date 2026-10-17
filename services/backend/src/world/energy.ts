// Energy regenerates lazily: we store a value and when it was set, and compute the
// current amount from the time that has passed. Pure functions, no DB access.

import type { Energy } from '@status/shared';

export interface EnergyConfig {
  max: number;
  /** Minutes to regenerate one point. */
  regenMinutes: number;
}

export interface StoredEnergy {
  energy: number;
  energyUpdatedAt: Date;
}

const MINUTE = 60_000;

function regenerated(stored: StoredEnergy, config: EnergyConfig, now: Date) {
  const regenMs = config.regenMinutes * MINUTE;
  const gained = Math.floor((now.getTime() - stored.energyUpdatedAt.getTime()) / regenMs);
  const current = Math.min(config.max, stored.energy + gained);
  // Keep partial progress toward the next point (unless full, where it doesn't count).
  const since =
    current >= config.max
      ? now
      : new Date(stored.energyUpdatedAt.getTime() + gained * regenMs);
  return { current, since, regenMs };
}

export function currentEnergy(stored: StoredEnergy, config: EnergyConfig, now = new Date()): Energy {
  const { current, since, regenMs } = regenerated(stored, config, now);
  return {
    current,
    max: config.max,
    nextAt: current >= config.max ? null : new Date(since.getTime() + regenMs).toISOString(),
  };
}

/** The stored values after spending one point. Caller must check current >= 1 first. */
export function spendOne(stored: StoredEnergy, config: EnergyConfig, now = new Date()): StoredEnergy {
  const { current, since } = regenerated(stored, config, now);
  return { energy: current - 1, energyUpdatedAt: since };
}
