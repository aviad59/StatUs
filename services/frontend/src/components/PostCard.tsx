import { Heart, MessageCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { type likeAction, usePendingTexts } from '@/actions.ts'
import { timeAgo } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import type { Post } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { CommentsSheet } from './CommentsSheet.tsx'
import { TextForm } from './TextForm.tsx'

const PREVIEW_COMMENTS = 2
// Two taps on the photo (or a text post's text) within this window count as a double tap.
const DOUBLE_TAP_MS = 300

export function PostCard({ post }: { post: Post }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const currentUser = useCurrentUser()
  const commentAction = `/actions/posts/${post.id}/comments`
  const pending = usePendingTexts(commentAction)
  // Like Instagram, the preview shows the newest comments.
  const comments = post.comments.slice(-PREVIEW_COMMENTS)

  const { liked, likes, setLiked } = useLike(post)
  // Bumped on each double tap, to replay the heart animation.
  const [burst, setBurst] = useState(0)
  const lastTap = useRef(0)
  const onPhotoTap = () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      setBurst((n) => n + 1)
      // Double tap only likes, never unlikes (same as Instagram).
      if (!liked) setLiked(true)
    } else {
      lastTap.current = now
    }
  }

  return (
    <article className="pb-4">
      <header className="flex items-center gap-2 px-3 py-2">
        <Avatar src={post.author.avatarUrl} alt={post.author.username} />
        <span className="text-sm font-semibold">{post.author.username}</span>
      </header>

      {/* touch-action: manipulation stops the browser treating a double tap as zoom. */}
      <div className="relative touch-manipulation select-none" onClick={onPhotoTap}>
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt={post.caption}
            draggable={false}
            className="aspect-square w-full bg-neutral-200 object-cover dark:bg-neutral-800"
          />
        ) : (
          // A text-only post: the text takes the photo's place.
          <p className="flex min-h-48 items-center justify-center bg-neutral-100 px-6 py-10 text-center text-xl leading-relaxed font-medium whitespace-pre-line dark:bg-neutral-900">
            {post.caption}
          </p>
        )}
        {burst > 0 && (
          <span
            key={burst}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ animation: 'like-burst 900ms ease-out forwards' }}
          >
            <Heart size={96} className="fill-white text-white drop-shadow-lg" />
          </span>
        )}
      </div>

      <div className="space-y-1 px-3 pt-2 text-sm">
        <div className="flex items-center gap-4 pb-1">
          <button type="button" onClick={() => setLiked(!liked)} aria-label={liked ? 'ביטול לייק' : 'לייק'}>
            <Heart
              size={24}
              className={`transition-transform active:scale-125 ${liked ? 'fill-red-500 text-red-500' : ''}`}
            />
          </button>
          <button type="button" onClick={() => setSheetOpen(true)} aria-label="תגובות">
            <MessageCircle size={24} />
          </button>
        </div>
        <p className="font-semibold">{likes.toLocaleString('he-IL')} לייקים</p>
        {post.imageUrl && (
          <p>
            <span className="font-semibold">{post.author.username}</span> {post.caption}
          </p>
        )}
        {post.comments.length > PREVIEW_COMMENTS && (
          <button type="button" onClick={() => setSheetOpen(true)} className="text-neutral-500">
            הצגת כל {post.comments.length} התגובות
          </button>
        )}
        <ul className="space-y-0.5">
          {comments.map((comment) => (
            <li key={comment.id}>
              <span className="font-semibold">{comment.author.username}</span> {comment.text}
            </li>
          ))}
          {!sheetOpen &&
            pending.map((text, i) => (
              <li key={`pending-${i}`} className="opacity-50">
                <span className="font-semibold">{currentUser.username}</span> {text}
              </li>
            ))}
        </ul>
        <p className="text-xs text-neutral-500">{timeAgo(post.createdAt)}</p>
        <TextForm
          action={commentAction}
          placeholder="הוספת תגובה..."
          submitLabel="פרסום"
          className="pt-2"
        />
      </div>

      {sheetOpen && <CommentsSheet post={post} onClose={() => setSheetOpen(false)} />}
    </article>
  )
}

/** The post's like state, updated optimistically: it flips as soon as you tap. */
function useLike(post: Post) {
  const fetcher = useFetcher<typeof likeAction>()
  // While a like is being saved (and the feed reloads after it), show what was sent.
  const sent = fetcher.formData?.get('liked')
  const liked = sent === undefined || sent === null ? post.liked : sent === 'true'
  const likes = post.likes + Number(liked) - Number(post.liked)

  const setLiked = (value: boolean) =>
    void fetcher.submit({ liked: String(value) }, { method: 'put', action: `/actions/posts/${post.id}/like` })

  return { liked, likes, setLiked }
}
