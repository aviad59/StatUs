import { useEffect } from 'react'
import { usePendingTexts } from '@/actions.ts'
import { timeAgo } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import type { Post } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { TextForm } from './TextForm.tsx'

/** All of a post's comments in a bottom sheet, like Instagram. Tap outside (or Escape) to close. */
export function CommentsSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const currentUser = useCurrentUser()
  const commentAction = `/actions/posts/${post.id}/comments`
  const pending = usePendingTexts(commentAction)

  // Keep the feed behind the sheet from scrolling, and close on Escape.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-label="תגובות"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-2xl bg-white dark:bg-neutral-900"
      >
        <header className="border-b border-neutral-200 py-2 text-center dark:border-neutral-800">
          <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
          <h2 className="text-sm font-semibold">תגובות</h2>
        </header>

        <ul className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {post.comments.length === 0 && !pending.length && (
            <li className="py-8 text-center text-neutral-500">עדיין אין תגובות. אפשר להיות הראשונים.</li>
          )}
          {post.comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar src={comment.author.avatarUrl} alt={comment.author.username} />
              <div>
                <p>
                  <span className="font-semibold">{comment.author.username}</span>{' '}
                  <span className="text-xs text-neutral-500">{timeAgo(comment.createdAt)}</span>
                </p>
                <p>{comment.text}</p>
              </div>
            </li>
          ))}
          {pending.map((text, i) => (
            <li key={`pending-${i}`} className="flex gap-3 opacity-50">
              <Avatar src={currentUser.avatarUrl} alt={currentUser.username} />
              <div>
                <p className="font-semibold">{currentUser.username}</p>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-neutral-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-800">
          <Avatar src={currentUser.avatarUrl} alt={currentUser.username} />
          <TextForm
            action={commentAction}
            placeholder={`הוספת תגובה ל-${post.author.username}...`}
            submitLabel="פרסום"
            className="flex-1"
          />
        </div>
      </section>
    </div>
  )
}
