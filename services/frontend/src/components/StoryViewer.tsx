import { Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import type { storyReplyAction } from '@/actions.ts'
import { timeAgo } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import { isStorySeen, markStorySeen } from '@/seen.ts'
import type { StoryGroup } from '@/types.ts'
import { useVisualViewport } from '@/viewport.ts'
import { Avatar } from './Avatar.tsx'
import { UserLink } from './UserLink.tsx'

const STORY_DURATION_MS = 5000

interface StoryViewerProps {
  groups: StoryGroup[]
  startGroup: number
  onClose: () => void
}

// Opening someone's stories resumes at the first one you haven't watched.
const firstUnseen = (group: StoryGroup) => Math.max(0, group.stories.findIndex((s) => !isStorySeen(s.id)))

export function StoryViewer({ groups, startGroup, onClose }: StoryViewerProps) {
  const [groupIndex, setGroupIndex] = useState(startGroup)
  const [storyIndex, setStoryIndex] = useState(() => firstUnseen(groups[startGroup]))
  const group = groups[groupIndex]
  const story = group.stories[storyIndex]
  const currentUser = useCurrentUser()
  const viewport = useVisualViewport()
  useEffect(() => markStorySeen(story.id), [story.id])
  const canReply = group.user.id !== currentUser.id

  // Replying sends a DM and opens that chat (storyReplyAction). The story pauses
  // while you type, like Instagram.
  const reply = useFetcher<typeof storyReplyAction>()
  const [typing, setTyping] = useState(false)
  const paused = typing || reply.state !== 'idle'
  const replyError = reply.state === 'idle' && reply.data && 'error' in reply.data ? reply.data.error : null

  const next = () => {
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1)
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1)
      setStoryIndex(firstUnseen(groups[groupIndex + 1]))
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
    // Sized to the visible screen, so the keyboard pushes the reply box up instead of covering it.
    <div
      className="fixed inset-x-0 z-20 flex justify-center bg-black"
      style={{ top: viewport.offsetTop, height: viewport.height }}
    >
      <div className="relative h-full w-full max-w-md">
        <img src={story.imageUrl} alt="" className="h-full w-full object-cover" />
        {story.text && (
          // Like Instagram's text sticker: centered, on a dark pill so it reads on any photo.
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
            <span className="rounded-lg bg-black/55 box-decoration-clone px-3 py-1 text-xl leading-relaxed font-semibold text-white">
              {story.text}
            </span>
          </p>
        )}

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
                    style={{
                      animation: `story-progress ${STORY_DURATION_MS}ms linear forwards`,
                      animationPlayState: paused ? 'paused' : 'running',
                    }}
                    onAnimationEnd={next}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <UserLink user={group.user} className="flex items-center gap-2">
              <Avatar src={group.user.avatarUrl} alt={group.user.username} size={32} />
              <span className="text-sm font-semibold">{group.user.username}</span>
            </UserLink>
            <span className="text-xs text-white/70">{timeAgo(story.createdAt)}</span>
            <button type="button" onClick={onClose} className="ms-auto" aria-label="סגירה">
              <X size={26} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={prev}
          className={`absolute start-0 top-20 w-1/3 ${canReply ? 'bottom-20' : 'bottom-0'}`}
          aria-label="הסטורי הקודם"
        />
        <button
          type="button"
          onClick={next}
          className={`absolute end-0 top-20 w-2/3 ${canReply ? 'bottom-20' : 'bottom-0'}`}
          aria-label="הסטורי הבא"
        />

        {canReply && (
          <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
            {replyError && <p className="text-center text-sm text-red-300">{replyError}</p>}
            <reply.Form
              method="post"
              action={`/actions/stories/${story.id}/reply`}
              className="flex items-center gap-3"
            >
              <input
                name="text"
                required
                autoComplete="off"
                maxLength={1000}
                placeholder={`שליחת הודעה ל-${group.user.username}...`}
                onFocus={() => setTyping(true)}
                onBlur={(e) => setTyping(e.currentTarget.value !== '')}
                className="min-w-0 flex-1 rounded-full border border-white/60 bg-transparent px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/70"
              />
              <button type="submit" disabled={reply.state !== 'idle'} aria-label="שליחה" className="text-white">
                {/* The plane points the RTL way. */}
                <Send size={24} className="-scale-x-100" />
              </button>
            </reply.Form>
          </div>
        )}
      </div>
    </div>
  )
}
