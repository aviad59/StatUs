import { X } from 'lucide-react'
import { useState } from 'react'
import type { StoryGroup } from '@/types.ts'
import { Avatar } from './Avatar.tsx'

const STORY_DURATION_MS = 5000

interface StoryViewerProps {
  groups: StoryGroup[]
  startGroup: number
  onClose: () => void
}

export function StoryViewer({ groups, startGroup, onClose }: StoryViewerProps) {
  const [groupIndex, setGroupIndex] = useState(startGroup)
  const [storyIndex, setStoryIndex] = useState(0)
  const group = groups[groupIndex]
  const story = group.stories[storyIndex]

  const next = () => {
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1)
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1)
      setStoryIndex(0)
    } else {
      onClose()
    }
  }

  const prev = () => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1)
    } else if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1)
      setStoryIndex(groups[groupIndex - 1].stories.length - 1)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-center bg-black">
      <div className="relative h-full w-full max-w-md">
        <img src={story.imageUrl} alt="" className="h-full w-full object-cover" />

        <div className="absolute inset-x-0 top-0 space-y-3 bg-gradient-to-b from-black/60 to-transparent p-3 text-white">
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/40">
                {i < storyIndex && <div className="h-full w-full bg-white" />}
                {i === storyIndex && (
                  // Keyed per story so the animation restarts; its end advances to the next story.
                  <div
                    key={story.id}
                    className="h-full bg-white"
                    style={{ animation: `story-progress ${STORY_DURATION_MS}ms linear forwards` }}
                    onAnimationEnd={next}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Avatar src={group.user.avatarUrl} alt={group.user.username} size={32} />
            <span className="text-sm font-semibold">{group.user.username}</span>
            <button type="button" onClick={onClose} className="ms-auto" aria-label="סגירה">
              <X size={26} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={prev}
          className="absolute bottom-0 start-0 top-20 w-1/3"
          aria-label="הסטורי הקודם"
        />
        <button
          type="button"
          onClick={next}
          className="absolute bottom-0 end-0 top-20 w-2/3"
          aria-label="הסטורי הבא"
        />
      </div>
    </div>
  )
}
