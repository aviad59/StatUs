import { Zap } from 'lucide-react'
import { timeUntil } from '@/format.ts'
import type { WorldStatus } from '@/types.ts'

/**
 * How many DMs are left before the next one costs an energy point (one point buys
 * `perEnergy` messages). `sending` counts messages still on their way, so the
 * counter drops as soon as you send.
 */
export function DmCounter({ world, sending }: { world: WorldStatus; sending: number }) {
  const { perEnergy } = world.dm
  const left = Math.max(0, world.dm.messagesLeft - sending)
  const { current, nextAt } = world.energy

  let label: string
  if (left > 0) label = left === 1 ? 'נשארה הודעה אחת' : `נשארו ${left} הודעות`
  else if (current > 0) label = `ההודעה הבאה תעלה נקודת אנרגיה (${perEnergy} הודעות)`
  else label = `אין אנרגיה להודעות${nextAt ? ` · נקודה הבאה ${timeUntil(nextAt)}` : ''}`

  return (
    <div
      className={`flex items-center gap-1.5 pb-2 text-xs ${
        left === 0 && current === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500'
      }`}
    >
      <Zap size={12} className="fill-amber-400 text-amber-400" />
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: perEnergy }, (_, i) => (
          <span
            key={i}
            className={`size-1.5 rounded-full ${i < left ? 'bg-amber-400' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  )
}
