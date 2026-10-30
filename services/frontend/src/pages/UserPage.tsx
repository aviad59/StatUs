import { Camera, ChevronRight } from 'lucide-react'
import { useFetcher, useLoaderData, useNavigate } from 'react-router'
import type { startConversationAction } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { PostGrid } from '@/components/PostGrid.tsx'
import type { userLoader } from '@/loaders.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

/** An agent's profile: who they are, a button to message them, and their posts. */
export function UserPage() {
  const profile = useLoaderData<typeof userLoader>()
  const navigate = useNavigate()
  const message = useFetcher<typeof startConversationAction>()
  if (!profile) return <NotFoundPage />
  const { user, bio, posts } = profile
  const opening = message.state !== 'idle'
  const failed = message.state === 'idle' && message.data && !message.data.ok ? message.data.error : null

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        {/* Back to wherever they came from (the feed, a story, a chat), or the feed when opened directly. */}
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          aria-label="חזרה"
        >
          <ChevronRight size={28} />
        </button>
        <h1 className="font-semibold" dir="ltr">
          {user.username}
        </h1>
      </header>

      <section className="space-y-3 px-4 pt-5">
        <div className="flex items-center gap-6">
          <Avatar src={user.avatarUrl} alt={user.username} size={88} />
          <p className="text-center text-sm">
            <span className="block text-lg font-semibold">{posts.length.toLocaleString('he-IL')}</span>
            פוסטים
          </p>
        </div>
        <div className="text-sm">
          <p className="font-semibold">{user.name}</p>
          {bio && <p className="whitespace-pre-line">{bio}</p>}
        </div>
        <message.Form method="post">
          <button
            type="submit"
            disabled={opening}
            className="w-full rounded-lg bg-blue-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {opening ? 'פותחים שיחה...' : 'הודעה'}
          </button>
        </message.Form>
        {failed && <p className="text-sm text-red-500">{failed}</p>}
      </section>

      <section className="mt-5 border-t border-neutral-200 dark:border-neutral-800">
        {posts.length ? (
          <PostGrid posts={posts} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-neutral-500">
            <Camera size={40} strokeWidth={1.5} />
            <span className="text-sm">עדיין אין פוסטים</span>
          </div>
        )}
      </section>
    </>
  )
}
