import { ChevronLeft, Loader2, Zap } from 'lucide-react'
import { Link } from 'react-router'
import type { ActionResult } from '@/actions.ts'
import { timeUntil } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import type { TickEvent, TickResult, WorldStatus } from '@/types.ts'
import { Avatar } from './Avatar.tsx'

// Hebrew verbs agree with the actor's gender (masculine when unknown).
// A pending post or story is still being saved (its photo is drawn after the tick).
const describe = (event: TickEvent, pending: Set<string>, meId: string) => {
  const female = event.actor.gender === 'female'
  switch (event.type) {
    case 'post':
      if (pending.has(event.postId)) return 'מעלה פוסט...'
      return female ? 'פרסמה פוסט' : 'פרסם פוסט'
    case 'story':
      if (pending.has(event.storyId)) return 'מעלה סטורי...'
      return female ? 'העלתה סטורי' : 'העלה סטורי'
    case 'comment':
      return `${female ? 'הגיבה' : 'הגיב'} ${event.postAuthor.id === meId ? 'לפוסט שלך' : `לפוסט של ${event.postAuthor.username}`}`
    case 'message':
      return female ? 'שלחה לך הודעה' : 'שלח לך הודעה'
  }
}

/** Where tapping an event takes you: the chat, the post in the feed, or the story. */
function EventRow({
  event,
  pending,
  onOpenStory,
}: {
  event: TickEvent
  pending: Set<string>
  onOpenStory: (userId: string) => void
}) {
  const me = useCurrentUser()
  const waiting = (event.type === 'post' && pending.has(event.postId)) || (event.type === 'story' && pending.has(event.storyId))
  const body = (
    <>
      <Avatar src={event.actor.avatarUrl} alt={event.actor.username} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="font-semibold">{event.actor.username}</span> {describe(event, pending, me.id)}
        </span>
        {/* A teaser of what they wrote, to make you want to look. */}
        {event.text && <span className="block truncate text-xs text-neutral-500">{event.text}</span>}
      </span>
      {waiting ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-neutral-400" />
      ) : (
        <ChevronLeft size={16} className="shrink-0 text-neutral-400" />
      )}
    </>
  )
  const row = 'flex w-full items-center gap-2 rounded-md px-1 py-1 text-start hover:bg-neutral-200/60 dark:hover:bg-neutral-800'

  if (event.type === 'message') {
    return (
      <Link to={`/messages/${event.conversationId}`} className={row}>
        {body}
      </Link>
    )
  }
  const open = () => {
    if (event.type === 'story') onOpenStory(event.actor.id)
    else document.getElementById(`post-${event.postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <button type="button" onClick={open} disabled={waiting} className={row}>
      {body}
    </button>
  )
}

/** Energy meter, the button that moves the world on, and what happened in the last tick (or why it didn't run). */
export function WorldBar({
  world,
  result,
  pending,
  notice,
  ticking,
  onTick,
  onOpenStory,
}: {
  world: WorldStatus
  result: ActionResult<TickResult> | undefined
  /** IDs of posts and stories from the last tick that aren't in the feed yet. */
  pending: Set<string>
  /** A message to show instead of the last result, e.g. "out of energy". */
  notice: string | null
  ticking: boolean
  /** Runs a tick, same as pulling the feed down. */
  onTick: () => void
  onOpenStory: (userId: string) => void
}) {
  const { current, max, nextAt } = world.energy
  const empty = current === 0

  return (
    <section className="space-y-2.5 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-sm font-semibold" aria-label={`אנרגיה ${current} מתוך ${max}`}>
          <Zap size={16} className="fill-amber-400 text-amber-400" />
          {current}/{max}
        </div>
        <div className="flex flex-1 gap-1" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < current ? 'bg-amber-400' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onTick}
        disabled={ticking || empty}
        aria-busy={ticking}
        // Stays colorful (and pulses) while the world moves; grey only when out of energy.
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold shadow-sm transition active:scale-[0.98] ${
          empty && !ticking
            ? 'bg-neutral-200 text-neutral-500 shadow-none dark:bg-neutral-800 dark:text-neutral-400'
            : 'bg-gradient-to-l from-amber-400 to-pink-500 text-white'
        } ${ticking ? 'animate-pulse' : ''}`}
      >
        {/* Always the same words, so it's clearly the same button; the icon shows what's going on. */}
        {ticking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className={empty ? '' : 'fill-white'} />}
        מה קורה עכשיו בדירה?
      </button>
      <p className="text-center text-xs text-neutral-500">
        {empty
          ? `נגמרה האנרגיה${nextAt ? ` · עוד נקודה ${timeUntil(nextAt)}` : ''}. בינתיים אפשר לגלול, להגיב ולשלוח הודעות`
          : `כל צעד עולה ⚡1: השותפים מגיבים, כותבים לך והסיפור מתקדם${nextAt ? ` · הנקודה הבאה ${timeUntil(nextAt)}` : ''}`}
      </p>

      {notice ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>
      ) : (
        result &&
        !ticking &&
        (result.ok ? (
          <div className="animate-[pop-in_300ms_ease-out] rounded-lg bg-neutral-100 p-2 text-sm dark:bg-neutral-900">
            {result.data.events.length === 0 ? (
              <p className="text-neutral-500">רגע שקט, אף אחד לא פרסם כלום. אולי לנסות שוב?</p>
            ) : (
              <>
                <p className="px-1 pb-1 text-xs font-semibold text-neutral-500">מה קרה עכשיו</p>
                <ul className="space-y-0.5">
                  {result.data.events.map((event, i) => (
                    <li key={i}>
                      <EventRow event={event} pending={pending} onOpenStory={onOpenStory} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-500">{result.error}</p>
        ))
      )}
    </section>
  )
}
