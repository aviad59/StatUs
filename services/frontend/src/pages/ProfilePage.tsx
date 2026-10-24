import { Camera } from 'lucide-react'
import { Link, useFetcher, useLoaderData } from 'react-router'
import type { updateProfileAction } from '@/actions.ts'
import { Avatar } from '@/components/Avatar.tsx'
import { type profileLoader, useCurrentUser } from '@/loaders.ts'
import type { Gender } from '@/types.ts'

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
]

export function ProfilePage() {
  const currentUser = useCurrentUser()
  const posts = useLoaderData<typeof profileLoader>()
  const fetcher = useFetcher<typeof updateProfileAction>()
  // Show the new choice right away, before the server confirms it.
  const gender = (fetcher.formData?.get('gender') as Gender | null) ?? currentUser.gender

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

        <div className="mt-6 w-full max-w-xs space-y-2">
          <p className="text-sm font-semibold">איך לפנות אליך?</p>
          <fetcher.Form method="post" className="flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-900">
            {GENDERS.map((option) => (
              <button
                key={option.value}
                type="submit"
                name="gender"
                value={option.value}
                aria-pressed={gender === option.value}
                className={`flex-1 rounded-full py-1.5 text-sm ${
                  gender === option.value
                    ? 'bg-white font-semibold shadow-sm dark:bg-neutral-700'
                    : 'text-neutral-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </fetcher.Form>
          <p className="text-xs text-neutral-500">
            הדמויות ישתמשו בזה כשהן כותבות לך ועלייך.
          </p>
          {fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok && (
            <p className="text-xs text-red-500">{fetcher.data.error}</p>
          )}
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
