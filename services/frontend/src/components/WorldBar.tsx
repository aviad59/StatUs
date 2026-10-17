import { FastForward, Loader2, Zap } from 'lucide-react'
import { useFetcher } from 'react-router'
import type { tickAction } from '@/actions.ts'
import { timeUntil } from '@/format.ts'
import type { TickEvent, WorldStatus } from '@/types.ts'

const describe = (event: TickEvent) => {
  switch (event.type) {
    case 'post':
      return 'פרסם/ה פוסט'
    case 'comment':
      return `הגיב/ה לפוסט של ${event.postAuthor.username}`
    case 'message':
      return 'שלח/ה לך הודעה'
  }
}

/** Energy meter and the button that moves the world forward one tick. */
export function WorldBar({ world }: { world: WorldStatus }) {
  const fetcher = useFetcher<typeof tickAction>()
  const busy = fetcher.state !== 'idle'
  const { current, max, nextAt } = world.energy
  const result = fetcher.data

  return (
    <section className="space-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <Zap size={16} className="fill-amber-400 text-amber-400" />
            אנרגיה {current}/{max}
          </div>
          <div className="mt-1 flex gap-1" aria-hidden>
            {Array.from({ length: max }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < current ? 'bg-amber-400' : 'bg-neutral-200 dark:bg-neutral-800'
                }`}
              />
            ))}
          </div>
          {nextAt && (
            <p className="mt-1 text-xs text-neutral-500">נקודה הבאה {timeUntil(nextAt)}</p>
          )}
        </div>

        <fetcher.Form method="post" action="/actions/tick">
          <button
            type="submit"
            disabled={busy || current < 1}
            className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FastForward size={16} />}
            {busy ? 'העולם מתקדם...' : 'הצעד הבא'}
          </button>
        </fetcher.Form>
      </div>

      {!busy && result && !result.ok && <p className="text-sm text-red-500">{result.error}</p>}
      {!busy && result?.ok && (
        <div className="rounded-lg bg-neutral-100 p-2 text-sm dark:bg-neutral-900">
          {result.data.events.length === 0 ? (
            <p className="text-neutral-500">יום שקט, אף אחד לא פרסם כלום.</p>
          ) : (
            <ul className="space-y-0.5">
              {result.data.events.map((event, i) => (
                <li key={i}>
                  <span className="font-semibold">{event.actor.username}</span> {describe(event)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
