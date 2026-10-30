import { ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useFetcher, useLoaderData, useParams } from 'react-router'
import { type replyAction, usePendingTexts } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { DmCounter } from '@/components/DmCounter.tsx'
import { TextForm } from '@/components/TextForm.tsx'
import { UserLink } from '@/components/UserLink.tsx'
import { clockTime, timeAgo } from '@/format.ts'
import type { conversationLoader } from '@/loaders.ts'
import type { Conversation, Message, User, WorldStatus } from '@/types.ts'
import { useVisualViewport } from '@/viewport.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

const bubble = 'max-w-[75%] rounded-2xl px-3 py-2 text-sm'

// After you send a message, the agent "sees" it and comes online, then starts typing
// a bit later. The reply itself is generated while they type (replyAction).
const ONLINE_AFTER_MS = 1200
const TYPING_AFTER_MS = 1500
// Counts as online if their last message is this recent.
const RECENTLY_ACTIVE_MS = 2 * 60_000
// After answering they stay a little and then leave, like a real person.
const STAY_ONLINE_MS = [15_000, 45_000] as const

export function ConversationPage() {
  const data = useLoaderData<typeof conversationLoader>()
  if (!data) return <NotFoundPage />
  // A fresh view per conversation, so the online/typing state doesn't carry over.
  return <ConversationView key={data.conversation.id} {...data} />
}

function ConversationView({ conversation, world }: { conversation: Conversation; world: WorldStatus }) {
  const sendAction = `/messages/${useParams().id}`
  const pending = usePendingTexts(sendAction)
  const { online, typing } = useAgentReply(conversation, pending.length > 0)
  useMarkRead(conversation)
  const viewport = useVisualViewport()
  const { listRef, contentRef, onScroll, stick } = useStickToBottom([
    conversation.messages.length + pending.length,
    typing,
    viewport.height,
  ])

  const lastActive = conversation.messages.findLast((m) => !m.fromMe)?.createdAt

  return (
    // Sized to the visible screen, not the page: when the keyboard opens, the whole chat
    // shrinks above it (input included) instead of the keyboard covering the messages.
    // Only the message list scrolls; RootLayout hides the bottom nav here.
    <div
      className="fixed inset-x-0 mx-auto flex max-w-md flex-col bg-white sm:border-x sm:border-neutral-200 dark:bg-neutral-950 sm:dark:border-neutral-800"
      style={{ top: viewport.offsetTop, height: viewport.height }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <Link to="/messages" aria-label="חזרה">
          <ChevronRight size={28} />
        </Link>
        {/* Tapping who you're talking to opens their profile. */}
        <UserLink user={conversation.user} className="flex items-center gap-3">
        <span className="relative">
          <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} />
          {online && (
            <span className="absolute end-0 bottom-0 size-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-950" />
          )}
        </span>
        <div className="text-sm">
          <p className="font-semibold">{conversation.user.name}</p>
          {online ? (
            <p className="text-xs text-neutral-500">{onlineLabel(conversation.user)}</p>
          ) : (
            lastActive && <p className="text-xs text-neutral-500">פעילות {timeAgo(lastActive)}</p>
          )}
        </div>
        </UserLink>
      </header>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {conversation.messages.length === 0 && pending.length === 0 && (
        // A new chat (opened from a profile): say who they are and nudge a first message.
        <div className="flex flex-col items-center gap-2 px-6 pt-10 text-center">
          <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} size={80} />
          <p className="font-semibold">{conversation.user.name}</p>
          <p className="text-sm text-neutral-500">
            עוד לא דיברתם. {conversation.user.gender === 'female' ? 'היא תענה' : 'הוא יענה'} מיד, אז אפשר לשאול מה
            קורה, לרכל, או לשאול על משהו שראית בפיד.
          </p>
        </div>
      )}

      <ul ref={contentRef} className="flex flex-col gap-1.5 p-3">
        {conversation.messages.map((message) => (
          <li
            key={message.id}
            title={clockTime(message.createdAt)}
            className={`flex flex-col gap-1 ${message.fromMe ? 'items-end' : 'items-start'}`}
          >
            {message.story && <StoryQuote story={message.story} name={conversation.user.name} />}
            <p
              className={`${bubble} ${
                message.fromMe ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800'
              }`}
            >
              {message.text}
            </p>
          </li>
        ))}
        {pending.map((text, i) => (
          <li key={`pending-${i}`} className={`${bubble} self-end bg-blue-500 text-white opacity-60`}>
            {text}
          </li>
        ))}
        {typing && (
          <li
            aria-label="מקליד..."
            className={`${bubble} flex gap-1 self-start bg-neutral-100 py-3 dark:bg-neutral-800`}
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-bounce rounded-full bg-neutral-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </li>
        )}
      </ul>
      </div>

      <div
        className="shrink-0 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-950"
        // Sending always brings you back to the newest message, even if you'd scrolled up.
        onSubmit={stick}
      >
        <DmCounter world={world} sending={pending.length} />
        <TextForm action={sendAction} placeholder="הודעה..." submitLabel="שליחה" />
      </div>
    </div>
  )
}

// Within this many px of the bottom counts as "reading the newest messages".
const NEAR_BOTTOM_PX = 80

/**
 * Keeps a scrolling list at its newest item when something changes (a message
 * arrives, the typing bubble shows, the keyboard opens), but only while the user is
 * already at the bottom: if they've scrolled up to read, it stays where they are.
 */
function useStickToBottom(changes: unknown[]) {
  const listRef = useRef<HTMLDivElement>(null)
  // Starts stuck, so the chat opens at its newest message.
  const atBottom = useRef(true)

  const onScroll = () => {
    const el = listRef.current
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }
  const stick = () => {
    atBottom.current = true
  }

  const pin = () => {
    const el = listRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }

  // Layout effect: scrolls before the frame is painted, so nothing visibly jumps.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when any tracked value changes
  useLayoutEffect(pin, changes)

  // Content that grows later (a story thumbnail finishing loading) keeps it pinned too.
  const contentRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(pin)
    observer.observe(contentRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pin only reads refs
  }, [])

  return { listRef, contentRef, onScroll, stick }
}

/** The story a message replies to, as a small thumbnail above it. */
function StoryQuote({ story, name }: { story: NonNullable<Message['story']>; name: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-500">תגובה לסטורי של {name}</p>
      <div className="relative w-24 overflow-hidden rounded-xl">
        <img src={story.imageUrl} alt="" className="aspect-[9/16] w-full bg-neutral-200 object-cover dark:bg-neutral-800" />
        {story.text && (
          <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 text-center text-[10px] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
            {story.text}
          </span>
        )}
      </div>
    </div>
  )
}

const onlineLabel = (user: User) => (user.gender === 'female' ? 'מחוברת' : 'מחובר')

/**
 * When your message is the last one, the agent answers it: a moment later they come
 * online, then they start typing until the reply arrives. Waits while you're still
 * sending, so a few quick messages get one answer.
 */
function useAgentReply(conversation: Conversation, sending: boolean) {
  const reply = useFetcher<typeof replyAction>()
  const { submit } = reply // stable across renders
  const [phase, setPhase] = useState<'away' | 'online' | 'typing'>(() => {
    const lastActive = conversation.messages.findLast((m) => !m.fromMe)?.createdAt
    return lastActive && Date.now() - Date.parse(lastActive) < RECENTLY_ACTIVE_MS ? 'online' : 'away'
  })
  const last = conversation.messages.at(-1)
  const waiting = Boolean(last?.fromMe) && !sending
  const busy = waiting || reply.state !== 'idle'

  // Once nothing is left to answer, they go offline after a while.
  useEffect(() => {
    if (phase === 'away' || busy) return
    const [min, max] = STAY_ONLINE_MS
    const timer = setTimeout(() => setPhase('away'), min + Math.random() * (max - min))
    return () => clearTimeout(timer)
  }, [phase, busy])

  useEffect(() => {
    if (!waiting) return
    const timers = [
      setTimeout(() => {
        setPhase('online')
        void submit(null, {
          method: 'post',
          action: `/actions/conversations/${conversation.id}/reply`,
        })
      }, ONLINE_AFTER_MS),
      setTimeout(() => setPhase('typing'), ONLINE_AFTER_MS + TYPING_AFTER_MS),
    ]
    return () => timers.forEach(clearTimeout)
    // Runs once per unanswered message. A failed reply isn't retried here; the next tick answers it.
  }, [waiting, last?.id, conversation.id, submit])

  return {
    // Online if they wrote recently or came online to answer, until they leave (above).
    online: phase !== 'away',
    typing: phase === 'typing' && reply.state !== 'idle',
  }
}

/** Marks the conversation read while it's open, including replies that arrive meanwhile. */
function useMarkRead(conversation: Conversation) {
  const { submit } = useFetcher()
  useEffect(() => {
    if (!conversation.unread) return
    void submit(null, { method: 'post', action: `/actions/conversations/${conversation.id}/read` })
  }, [conversation.unread, conversation.id, submit])
}
