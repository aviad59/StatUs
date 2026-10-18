import { ChevronRight } from 'lucide-react'
import { Link, useLoaderData, useParams } from 'react-router'
import { usePendingTexts } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { TextForm } from '@/components/TextForm.tsx'
import { clockTime, timeAgo } from '@/format.ts'
import type { conversationLoader } from '@/loaders.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

const bubble = 'max-w-[75%] rounded-2xl px-3 py-2 text-sm'

export function ConversationPage() {
  const conversation = useLoaderData<typeof conversationLoader>()
  const sendAction = `/messages/${useParams().id}`
  const pending = usePendingTexts(sendAction)

  if (!conversation) return <NotFoundPage />

  const lastActive = conversation.messages.findLast((m) => !m.fromMe)?.createdAt

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <Link to="/messages" aria-label="חזרה">
          <ChevronRight size={28} />
        </Link>
        <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} />
        <div className="text-sm">
          <p className="font-semibold">{conversation.user.name}</p>
          {lastActive && <p className="text-xs text-neutral-500">פעילות {timeAgo(lastActive)}</p>}
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
      </ul>

      <div className="sticky bottom-14 bg-white p-3 dark:bg-neutral-950">
        <TextForm action={sendAction} placeholder="הודעה..." submitLabel="שליחה" />
        <p className="pt-1 text-center text-xs text-neutral-500">
          תשובות מגיעות בצעד הבא של העולם
        </p>
      </div>
    </div>
  )
}
