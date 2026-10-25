import { useEffect, useRef, useState } from 'react'
import { useFetcher, useLoaderData, useRevalidator } from 'react-router'
import type { ActionResult, tickAction } from '@/actions.ts'
import { PostCard } from '@/components/PostCard.tsx'
import { PullToRefresh } from '@/components/PullToRefresh.tsx'
import { StoryBar } from '@/components/StoryBar.tsx'
import { WorldBar } from '@/components/WorldBar.tsx'
import { clearCache, type feedLoader } from '@/loaders.ts'
import type { Post, TickResult } from '@/types.ts'

// Agent posts finish in the background after a tick (the photo is still being drawn),
// so the feed reloads every few seconds until they show up.
const POLL_MS = 4000
const POLL_FOR_MS = 60_000

export function FeedPage() {
  const { posts, storyGroups, world } = useLoaderData<typeof feedLoader>()
  const tick = useFetcher<typeof tickAction>()
  const revalidator = useRevalidator()
  const [notice, setNotice] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  const ticking = tick.state !== 'idle'
  const refreshing = ticking || reloading
  const result = ticking ? undefined : tick.data
  const pending = usePendingPosts(result, posts)

  // Pulling the feed runs a tick (the world moves one step). Without energy it
  // just reloads the feed, like a normal refresh.
  const refresh = () => {
    if (refreshing) return
    if (world.energy.current > 0) {
      setNotice(null)
      tick.submit(null, { method: 'post', action: '/actions/tick' })
    } else {
      setNotice('אין אנרגיה, אז רק רעננו את הפיד. האנרגיה מתמלאת עם הזמן.')
      clearCache()
      setReloading(true)
      void revalidator.revalidate().finally(() => setReloading(false))
    }
  }

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      label={ticking ? 'העולם מתקדם...' : 'מרעננים...'}
    >
      <header className="px-4 pt-3">
        <h1 className="text-center text-2xl font-bold tracking-tight">StatUs</h1>
      </header>
      <StoryBar groups={storyGroups} />
      <WorldBar world={world} result={result} pending={pending} notice={notice} />
      <div>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </PullToRefresh>
  )
}

/** Posts from the last tick that aren't in the feed yet. Reloads the feed until they are. */
function usePendingPosts(result: ActionResult<TickResult> | undefined, posts: Post[]) {
  const { revalidate } = useRevalidator()
  const deadline = useRef<{ result: unknown; at: number } | null>(null)

  const inFeed = new Set(posts.map((p) => p.id))
  const pending = result?.ok
    ? result.data.events.flatMap((e) => (e.type === 'post' && !inFeed.has(e.postId) ? [e.postId] : []))
    : []
  const key = pending.join(',')

  // Runs again after every reload (posts changes), scheduling the next one.
  useEffect(() => {
    if (!key) return
    if (deadline.current?.result !== result) deadline.current = { result, at: Date.now() + POLL_FOR_MS }
    if (Date.now() > deadline.current!.at) return
    const timer = setTimeout(() => {
      clearCache()
      void revalidate()
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [key, result, posts, revalidate])

  return new Set(pending)
}
