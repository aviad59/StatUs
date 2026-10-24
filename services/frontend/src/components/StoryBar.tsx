import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useCurrentUser } from '@/loaders.ts'
import type { StoryGroup } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { StoryViewer } from './StoryViewer.tsx'

// Sized so a bit over four stories fit across the screen; the cut-off one hints that the row scrolls.
const item = 'flex w-[calc(100%/4.2-0.5rem)] shrink-0 flex-col items-center gap-1'

export function StoryBar({ groups }: { groups: StoryGroup[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const currentUser = useCurrentUser()

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
        {groups.map((group, i) => (
          <li key={group.user.id} className={item}>
            <button type="button" onClick={() => setOpenIndex(i)} className="w-full">
              <Avatar src={group.user.avatarUrl} alt={group.user.username} size="fill" ring />
            </button>
            <span className="w-full truncate text-center text-xs">{group.user.username}</span>
          </li>
        ))}
      </ul>
      {openIndex !== null && (
        <StoryViewer groups={groups} startGroup={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  )
}
