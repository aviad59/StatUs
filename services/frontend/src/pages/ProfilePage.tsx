import { Camera } from 'lucide-react'
import { Link, useLoaderData } from 'react-router'
import { Avatar } from '@/components/Avatar.tsx'
import { type profileLoader, useCurrentUser } from '@/loaders.ts'

export function ProfilePage() {
  const currentUser = useCurrentUser()
  const posts = useLoaderData<typeof profileLoader>()

  return (
    <>
      <section className="flex flex-col items-center gap-3 px-4 pt-12">
        <Avatar src={currentUser.avatarUrl} alt={currentUser.username} size={128} />
        <div className="text-center">
          <p className="font-semibold">{currentUser.name}</p>
          <p className="text-sm text-neutral-500">@{currentUser.username}</p>
          <p className="pt-1 text-sm">
            <span className="font-semibold">{posts.length.toLocaleString('he-IL')}</span> פוסטים
          </p>
        </div>
      </section>

      {/* Your posts, newest first, in Instagram's three-column grid. */}
      <section className="mt-8 border-t border-neutral-200 dark:border-neutral-800">
        {posts.length ? (
          <ul className="grid grid-cols-3 gap-0.5">
            {posts.map((post) => (
              <li key={post.id}>
                <img
                  src={post.imageUrl}
                  alt={post.caption}
                  className="aspect-square w-full bg-neutral-200 object-cover dark:bg-neutral-800"
                />
              </li>
            ))}
          </ul>
        ) : (
          <Link to="/new" className="flex flex-col items-center gap-2 py-12 text-neutral-500">
            <Camera size={40} strokeWidth={1.5} />
            <span className="text-sm">עדיין אין פוסטים. לשתף את הראשון?</span>
          </Link>
        )}
      </section>
    </>
  )
}
