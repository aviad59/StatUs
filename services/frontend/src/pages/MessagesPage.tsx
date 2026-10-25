import { Link, useLoaderData } from 'react-router'
import { Avatar } from '@/components/Avatar.tsx'
import { timeAgo } from '@/format.ts'
import { type messagesLoader, useCurrentUser } from '@/loaders.ts'

export function MessagesPage() {
  const currentUser = useCurrentUser()
  const conversations = useLoaderData<typeof messagesLoader>()

  return (
    <>
      <header className="px-4 py-3">
        <h1 className="text-xl font-bold">{currentUser.username}</h1>
      </header>
      <h2 className="px-4 pb-2 font-semibold">הודעות</h2>
      <ul>
        {conversations.map((conversation) => {
          const last = conversation.lastMessage
          return (
            <li key={conversation.id}>
              <Link
                to={`/messages/${conversation.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <Avatar src={conversation.user.avatarUrl} alt={conversation.user.username} size={52} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className={conversation.unread ? 'font-bold' : 'font-medium'}>{conversation.user.name}</p>
                  {last && (
                    <p
                      className={`truncate ${conversation.unread ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}
                    >
                      {last.fromMe ? (currentUser.gender === 'female' ? 'את: ' : 'אתה: ') : ''}
                      {last.text} · {timeAgo(last.createdAt)}
                    </p>
                  )}
                </div>
                {conversation.unread && (
                  <span aria-label="הודעה חדשה" className="size-2.5 shrink-0 rounded-full bg-orange-500" />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
