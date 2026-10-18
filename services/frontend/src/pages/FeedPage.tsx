import { useState } from 'react'
import { useFetcher, useLoaderData, useRevalidator } from 'react-router'
import type { tickAction } from '@/actions.ts'
import { PostCard } from '@/components/PostCard.tsx'
import { PullToRefresh } from '@/components/PullToRefresh.tsx'
import { StoryBar } from '@/components/StoryBar.tsx'
import { WorldBar } from '@/components/WorldBar.tsx'
import type { feedLoader } from '@/loaders.ts'

export function FeedPage() {
  const { posts, storyGroups, world } = useLoaderData<typeof feedLoader>()
  const tick = useFetcher<typeof tickAction>()
  const revalidator = useRevalidator()
  const [notice, setNotice] = useState<string | null>(null)

  const ticking = tick.state !== 'idle'
  const refreshing = ticking || revalidator.state !== 'idle'

  // Pulling the feed runs a tick (the world moves one step). Without energy it
  // just reloads the feed, like a normal refresh.
  const refresh = () => {
    if (refreshing) return
    if (world.energy.current > 0) {
      setNotice(null)
      tick.submit(null, { method: 'post', action: '/actions/tick' })
    } else {
      setNotice('אין אנרגיה, אז רק רעננו את הפיד. האנרגיה מתמלאת עם הזמן.')
      void revalidator.revalidate()
    }
  }

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      label={ticking ? 'העולם מתקדם...' : 'מרעננים...'}
    >
      <header className="px-4 pt-3">
        <h1 className="text-2xl font-bold tracking-tight">StatUs</h1>
      </header>
      <StoryBar groups={storyGroups} />
      <WorldBar world={world} result={ticking ? undefined : tick.data} notice={notice} />
      <div>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </PullToRefresh>
  )
}
