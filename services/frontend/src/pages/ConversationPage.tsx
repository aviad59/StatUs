import { ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Avatar } from '@/components/Avatar.tsx'
import { conversations } from '@/mocks/data.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

export function ConversationPage() {
  const { id } = useParams()
  const conversation = conversations.find((c) => c.id === id)

  if (!conversation) return <NotFoundPage />

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <Link to="/messages" aria-label="חזרה">
          <ChevronRight size={28} />
        </Link>
        <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} />
        <div className="text-sm">
          <p className="font-semibold">{conversation.user.name}</p>
          <p className="text-xs text-neutral-500">פעילות לפני {conversation.lastActive}</p>
        </div>
      </header>

      <ul className="flex flex-1 flex-col gap-1.5 p-3">
        {conversation.messages.map((message) => (
          <li
            key={message.id}
            title={message.sentAt}
            className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
              message.fromMe
                ? 'self-end bg-blue-500 text-white'
                : 'self-start bg-neutral-100 dark:bg-neutral-800'
            }`}
          >
            {message.text}
          </li>
        ))}
      </ul>

      <div className="sticky bottom-14 bg-white p-3 dark:bg-neutral-950">
        <input
          disabled
          placeholder="הודעה..."
          className="w-full rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm dark:border-neutral-700"
        />
      </div>
    </div>
  )
}
