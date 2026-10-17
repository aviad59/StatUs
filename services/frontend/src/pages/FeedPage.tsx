import { useLoaderData } from 'react-router'
import { PostCard } from '@/components/PostCard.tsx'
import { StoryBar } from '@/components/StoryBar.tsx'
import { WorldBar } from '@/components/WorldBar.tsx'
import type { feedLoader } from '@/loaders.ts'

export function FeedPage() {
  const { posts, storyGroups, world } = useLoaderData<typeof feedLoader>()

  return (
    <>
      <header className="px-4 pt-3">
        <h1 className="text-2xl font-bold tracking-tight">StatUs</h1>
      </header>
      <StoryBar groups={storyGroups} />
      <WorldBar world={world} />
      <div>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </>
  )
}
