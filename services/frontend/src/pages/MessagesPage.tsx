import { Link } from 'react-router'
import { Avatar } from '@/components/Avatar.tsx'
import { conversations, currentUser } from '@/mocks/data.ts'

export function MessagesPage() {
  return (
    <>
      <header className="px-4 py-3">
        <h1 className="text-xl font-bold">{currentUser.username}</h1>
      </header>
      <h2 className="px-4 pb-2 font-semibold">הודעות</h2>
      <ul>
        {conversations.map((conversation) => {
          const last = conversation.messages.at(-1)
          return (
            <li key={conversation.id}>
              <Link
                to={`/messages/${conversation.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} size={52} />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{conversation.user.name}</p>
                  <p className="truncate text-neutral-500">
                    {last?.fromMe ? 'את/ה: ' : ''}
                    {last?.text} · {conversation.lastActive}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
