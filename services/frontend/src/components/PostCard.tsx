import { Heart, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import type { Post } from '@/types.ts'
import { Avatar } from './Avatar.tsx'

const PREVIEW_COMMENTS = 2

export function PostCard({ post }: { post: Post }) {
  const [showAll, setShowAll] = useState(false)
  const comments = showAll ? post.comments : post.comments.slice(0, PREVIEW_COMMENTS)
  const hasMore = post.comments.length > PREVIEW_COMMENTS

  return (
    <article className="pb-4">
      <header className="flex items-center gap-2 px-3 py-2">
        <Avatar src={post.author.avatarUrl} alt={post.author.username} />
        <span className="text-sm font-semibold">{post.author.username}</span>
        <span className="text-sm text-neutral-500">· {post.postedAgo}</span>
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
        </ul>
      </div>
    </article>
  )
}
