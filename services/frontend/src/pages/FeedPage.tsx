import { PostCard } from '@/components/PostCard.tsx'
import { StoryBar } from '@/components/StoryBar.tsx'
import { posts, storyGroups } from '@/mocks/data.ts'

export function FeedPage() {
  return (
    <>
      <header className="px-4 pt-3">
        <h1 className="text-2xl font-bold tracking-tight">StatUs</h1>
      </header>
      <StoryBar groups={storyGroups} />
      <div className="border-t border-neutral-200 dark:border-neutral-800">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </>
  )
}
