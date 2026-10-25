import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher, useLoaderData, useParams } from 'react-router'
import { type replyAction, usePendingTexts } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { DmCounter } from '@/components/DmCounter.tsx'
import { TextForm } from '@/components/TextForm.tsx'
import { clockTime, timeAgo } from '@/format.ts'
import type { conversationLoader } from '@/loaders.ts'
import type { Conversation, User, WorldStatus } from '@/types.ts'
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
  const endRef = useRef<HTMLDivElement>(null)

  const messageCount = conversation.messages.length + pending.length
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messageCount, typing])

  const lastActive = conversation.messages.findLast((m) => !m.fromMe)?.createdAt

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <Link to="/messages" aria-label="חזרה">
          <ChevronRight size={28} />
        </Link>
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
      </header>

      <ul className="flex flex-1 flex-col gap-1.5 p-3">
        {conversation.messages.map((message) => (
          <li
            key={message.id}
            title={clockTime(message.createdAt)}
            className={`${bubble} ${
              message.fromMe
                ? 'self-end bg-blue-500 text-white'
                : 'self-start bg-neutral-100 dark:bg-neutral-800'
            }`}
          >
            {message.text}
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
      <div ref={endRef} />

      <div className="sticky bottom-14 bg-white p-3 dark:bg-neutral-950">
        <DmCounter world={world} sending={pending.length} />
        <TextForm action={sendAction} placeholder="הודעה..." submitLabel="שליחה" />
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
