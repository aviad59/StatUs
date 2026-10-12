import { useState } from 'react'
import type { StoryGroup } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { StoryViewer } from './StoryViewer.tsx'

export function StoryBar({ groups }: { groups: StoryGroup[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <>
      <ul className="flex gap-4 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {groups.map((group, i) => (
          <li key={group.user.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="flex w-16 flex-col items-center gap-1"
            >
              <Avatar src={group.user.avatarUrl} alt={group.user.username} size={60} ring />
              <span className="w-full truncate text-center text-xs">{group.user.username}</span>
            </button>
          </li>
        ))}
      </ul>
      {openIndex !== null && (
        <StoryViewer groups={groups} startGroup={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  )
}
