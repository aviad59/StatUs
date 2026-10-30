import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Post } from '@/types.ts'
import { PostCard } from './PostCard.tsx'

/** Posts in Instagram's three-column grid. Tapping one opens it in full, with likes and comments. */
export function PostGrid({ posts }: { posts: Post[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  // Looked up by id, so the open post updates when the page reloads (a new like or comment).
  const open = posts.find((p) => p.id === openId)

  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5">
        {posts.map((post) => (
          <li key={post.id}>
            <button type="button" onClick={() => setOpenId(post.id)} className="block w-full">
              {post.imageUrl ? (
                <img
                  src={post.imageUrl}
                  alt={post.caption}
                  className="aspect-square w-full bg-neutral-200 object-cover dark:bg-neutral-800"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 p-2 dark:bg-neutral-900">
                  <p className="line-clamp-5 text-center text-xs">{post.caption}</p>
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
      {open && <PostOverlay post={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function PostOverlay({ post, onClose }: { post: Post; onClose: () => void }) {
  // Keep the page behind from scrolling, and close on Escape.
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
    <div className="fixed inset-0 z-20 overflow-y-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-md pb-16">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
          <button type="button" onClick={onClose} aria-label="חזרה">
            <ChevronRight size={28} />
          </button>
          <h2 className="font-semibold">פוסט</h2>
        </header>
        <PostCard post={post} />
      </div>
    </div>
  )
}
