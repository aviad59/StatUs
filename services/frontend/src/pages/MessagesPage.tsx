import { Link, useFetcher, useLoaderData } from 'react-router'
import type { startConversationAction } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { timeAgo } from '@/format.ts'
import { type messagesLoader, useCurrentUser } from '@/loaders.ts'
import type { User } from '@/types.ts'

export function MessagesPage() {
  const currentUser = useCurrentUser()
  const { conversations, people } = useLoaderData<typeof messagesLoader>()

  return (
    <>
      <header className="px-4 py-3">
        <h1 className="text-xl font-bold">{currentUser.username}</h1>
      </header>

      {/* Everyone you can write to, so a chat doesn't have to wait for them to start it. */}
      <ul className="flex gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {people.map((user) => (
          <li key={user.id}>
            <PersonButton user={user} />
          </li>
        ))}
      </ul>

      <h2 className="px-4 pb-2 font-semibold">הודעות</h2>
      {conversations.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-neutral-500">
          עדיין אין הודעות. אפשר לבחור מישהו למעלה ולכתוב ראשונים.
        </p>
      )}
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
                  {last ? (
                    <p
                      className={`truncate ${conversation.unread ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}
                    >
                      {last.fromMe ? (currentUser.gender === 'female' ? 'את: ' : 'אתה: ') : ''}
                      {last.text} · {timeAgo(last.createdAt)}
                    </p>
                  ) : (
                    <p className="text-neutral-500">שיחה חדשה</p>
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

/** Opens (or starts) the chat with this person. */
function PersonButton({ user }: { user: User }) {
  const fetcher = useFetcher<typeof startConversationAction>()
  const opening = fetcher.state !== 'idle'
  return (
    <fetcher.Form method="post" action={`/u/${encodeURIComponent(user.username)}`}>
      <button
        type="submit"
        disabled={opening}
        className="flex w-16 flex-col items-center gap-1 disabled:opacity-60"
        aria-label={`הודעה ל-${user.name}`}
      >
        <Avatar src={user.avatarUrl} alt={user.username} size={60} />
        <span className="w-full truncate text-center text-xs">{user.name.split(' ')[0]}</span>
      </button>
    </fetcher.Form>
  )
}
