import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCurrentUser } from '@/loaders.ts'
import { isStorySeen } from '@/seen.ts'
import type { StoryGroup } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { StoryViewer } from './StoryViewer.tsx'

// Sized so a bit over four stories fit across the screen; the cut-off one hints that the row scrolls.
const item = 'flex w-[calc(100%/4.2-0.5rem)] shrink-0 flex-col items-center gap-1'

const allSeen = (group: StoryGroup) => group.stories.every((s) => isStorySeen(s.id))

/**
 * The row of stories. Like Instagram, people with stories you haven't watched come first,
 * with a colored ring; watched ones get a grey ring. `openUserId` opens someone's stories
 * from outside (WorldBar's "posted a story").
 */
export function StoryBar({
  groups,
  openUserId,
  onOpenUser,
}: {
  groups: StoryGroup[]
  openUserId: string | null
  onOpenUser: (userId: string | null) => void
}) {
  const currentUser = useCurrentUser()
  // The order is fixed while a story is open, so the row doesn't reshuffle behind it.
  const [order, setOrder] = useState<StoryGroup[] | null>(null)
  const ordered = order ?? [...groups.filter((g) => !allSeen(g)), ...groups.filter(allSeen)]
  const openIndex = openUserId ? ordered.findIndex((g) => g.user.id === openUserId) : -1
  // Asked to open someone with no stories (theirs was dropped, or has expired): nothing to show, so close.
  const missing = openUserId !== null && openIndex < 0
  // However the viewer was opened (here or from outside), freeze the order (React allows this setState during render).
  if (openUserId && !order && !missing) setOrder(ordered)
  useEffect(() => {
    if (missing) onOpenUser(null)
  }, [missing, onOpenUser])

  const open = (userId: string) => onOpenUser(userId)
  const close = () => {
    setOrder(null)
    onOpenUser(null)
  }

  return (
    <>
      {/* Not mirrored: stories run left to right, like Instagram's Hebrew UI. */}
      <ul dir="ltr" className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none]">
        {/* Your own story. Placeholder: uploading stories isn't built yet. */}
        <li className={item}>
          <button type="button" title="בקרוב" className="relative w-full p-1">
            <Avatar src={currentUser.avatarUrl} alt="הסטורי שלך" size="fill" />
            <span className="absolute end-0.5 bottom-0.5 flex size-6 items-center justify-center rounded-full bg-blue-500 text-white ring-2 ring-white dark:ring-neutral-950">
              <Plus size={16} strokeWidth={3} />
            </span>
          </button>
          <span dir="rtl" className="w-full truncate text-center text-xs text-neutral-500">
            הסטורי שלך
          </span>
        </li>
        {ordered.map((group) => {
          const seen = allSeen(group)
          return (
            <li key={group.user.id} className={item}>
              <button type="button" onClick={() => open(group.user.id)} className="w-full">
                <Avatar src={group.user.avatarUrl} alt={group.user.username} size="fill" ring={seen ? 'seen' : true} />
              </button>
              <span className={`w-full truncate text-center text-xs ${seen ? 'text-neutral-500' : ''}`}>
                {group.user.username}
              </span>
            </li>
          )
        })}
      </ul>
      {openIndex >= 0 && <StoryViewer groups={ordered} startGroup={openIndex} onClose={close} />}
    </>
  )
}
