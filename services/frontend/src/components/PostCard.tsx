import { Heart, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { usePendingTexts } from '@/actions.ts'
import { timeAgo } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import type { Post } from '@/types.ts'
import { Avatar } from './Avatar.tsx'
import { TextForm } from './TextForm.tsx'

const PREVIEW_COMMENTS = 2

export function PostCard({ post }: { post: Post }) {
  const [showAll, setShowAll] = useState(false)
  const currentUser = useCurrentUser()
  const commentAction = `/actions/posts/${post.id}/comments`
  const pending = usePendingTexts(commentAction)
  // Like Instagram, the preview shows the newest comments.
  const comments = showAll ? post.comments : post.comments.slice(-PREVIEW_COMMENTS)
  const hasMore = post.comments.length > PREVIEW_COMMENTS

  return (
    <article className="pb-4">
      <header className="flex items-center gap-2 px-3 py-2">
        <Avatar src={post.author.avatarUrl} alt={post.author.username} />
        <span className="text-sm font-semibold">{post.author.username}</span>
        <span className="text-sm text-neutral-500">· {timeAgo(post.createdAt)}</span>
      </header>

      <img
        src={post.imageUrl}
        alt={post.caption}
        className="aspect-square w-full bg-neutral-200 object-cover dark:bg-neutral-800"
      />

      <div className="space-y-1 px-3 pt-2 text-sm">
        <div className="flex items-center gap-4 pb-1">
          <Heart size={24} />
          <MessageCircle size={24} />
        </div>
        <p className="font-semibold">{post.likes.toLocaleString('he-IL')} לייקים</p>
        <p>
          <span className="font-semibold">{post.author.username}</span> {post.caption}
        </p>
        {!showAll && hasMore && (
          <button type="button" onClick={() => setShowAll(true)} className="text-neutral-500">
            הצגת כל {post.comments.length} התגובות
          </button>
        )}
        <ul className="space-y-0.5">
          {comments.map((comment) => (
            <li key={comment.id}>
              <span className="font-semibold">{comment.author.username}</span> {comment.text}
            </li>
          ))}
          {pending.map((text, i) => (
            <li key={`pending-${i}`} className="opacity-50">
              <span className="font-semibold">{currentUser.username}</span> {text}
            </li>
          ))}
        </ul>
        <TextForm
          action={commentAction}
          placeholder="הוספת תגובה..."
          submitLabel="פרסום"
          className="pt-2"
        />
      </div>
    </article>
  )
}
