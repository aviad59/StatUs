import { Zap } from 'lucide-react'
import type { ActionResult } from '@/actions.ts'
import { timeUntil } from '@/format.ts'
import type { TickEvent, TickResult, WorldStatus } from '@/types.ts'

// Hebrew verbs agree with the actor's gender (masculine when unknown).
// A pending post is still being saved (its photo is drawn after the tick).
const describe = (event: TickEvent, pending: Set<string>) => {
  const female = event.actor.gender === 'female'
  switch (event.type) {
    case 'post':
      if (pending.has(event.postId)) return 'מעלה פוסט...'
      return female ? 'פרסמה פוסט' : 'פרסם פוסט'
    case 'comment':
      return `${female ? 'הגיבה' : 'הגיב'} לפוסט של ${event.postAuthor.username}`
    case 'message':
      return female ? 'שלחה לך הודעה' : 'שלח לך הודעה'
  }
}

/** Energy meter, plus what happened in the last tick (or why it didn't run). */
export function WorldBar({
  world,
  result,
  pending,
  notice,
}: {
  world: WorldStatus
  result: ActionResult<TickResult> | undefined
  /** IDs of posts from the last tick that aren't in the feed yet. */
  pending: Set<string>
  /** A message to show instead of the last result, e.g. "out of energy". */
  notice: string | null
}) {
  const { current, max, nextAt } = world.energy

  return (
    <section className="space-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-sm font-semibold">
          <Zap size={16} className="fill-amber-400 text-amber-400" />
          {current}/{max}
        </div>
        <div className="flex flex-1 gap-1" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < current ? 'bg-amber-400' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}
            />
          ))}
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        {current > 0 ? 'משכו את הפיד למטה כדי שהעולם יתקדם' : 'אין אנרגיה'}
        {nextAt && ` · נקודה הבאה ${timeUntil(nextAt)}`}
      </p>

      {notice ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>
      ) : (
        result &&
        (result.ok ? (
          <div className="rounded-lg bg-neutral-100 p-2 text-sm dark:bg-neutral-900">
            {result.data.events.length === 0 ? (
              <p className="text-neutral-500">רגע שקט, אף אחד לא פרסם כלום.</p>
            ) : (
              <ul className="space-y-0.5">
                {result.data.events.map((event, i) => (
                  <li key={i}>
                    <span className="font-semibold">{event.actor.username}</span> {describe(event, pending)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-500">{result.error}</p>
        ))
      )}
    </section>
  )
}
