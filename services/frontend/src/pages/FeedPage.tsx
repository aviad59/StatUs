import { useCallback, useEffect, useState } from 'react'
import { useFetcher, useLoaderData, useRevalidator } from 'react-router'
import type { ActionResult, tickAction } from '@/actions.ts'
import { IntroCard } from '@/components/IntroCard.tsx'
import { PostCard } from '@/components/PostCard.tsx'
import { PullToRefresh } from '@/components/PullToRefresh.tsx'
import { StoryBar } from '@/components/StoryBar.tsx'
import { StoryPanel } from '@/components/StoryPanel.tsx'
import { WorldBar } from '@/components/WorldBar.tsx'
import { clearCache, type feedLoader } from '@/loaders.ts'
import { useIntro } from '@/seen.ts'
import type { Post, StoryGroup, StoryNow, TickResult } from '@/types.ts'

// Agent posts and stories finish in the background after a tick (the photo is still
// being drawn), so the feed reloads every few seconds until they show up.
const POLL_MS = 4000
const POLL_FOR_MS = 60_000
// The story director takes up to a minute (more with a scene photo) to write what's next.
const CHAPTER_WAIT_MS = 90_000

export function FeedPage() {
  const { posts, storyGroups, world, story } = useLoaderData<typeof feedLoader>()
  const tick = useFetcher<typeof tickAction>()
  const revalidator = useRevalidator()
  const [notice, setNotice] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  const ticking = tick.state !== 'idle'
  const refreshing = ticking || reloading
  const result = ticking ? undefined : tick.data
  const pending = usePendingMedia(result, posts, storyGroups)
  // Posts from the tick just run get a "new" tag.
  const newPosts = new Set(result?.ok ? result.data.events.flatMap((e) => (e.type === 'post' ? [e.postId] : [])) : [])
  const intro = useIntro()
  // Whose stories are open (from the story row, or "posted a story" in WorldBar).
  const [storyUser, setStoryUser] = useState<string | null>(null)
  // Waiting for the story's next chapter: after a tick that ended one, or a choice.
  const [choiceMade, setChoiceMade] = useState<object | null>(null)
  const onChosen = useCallback(() => setChoiceMade({}), [])
  const storyTrigger = choiceMade ?? (result?.ok && result.data.storyMoving ? result : null)
  const fresh = useNextChapter(storyTrigger, story)

  // Pulling the feed runs a tick (the world moves one step). Without energy it
  // just reloads the feed, like a normal refresh.
  const refresh = () => {
    if (refreshing) return
    if (world.energy.current > 0) {
      setNotice(null)
      setChoiceMade(null)
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
      <StoryBar groups={storyGroups} openUserId={storyUser} onOpenUser={setStoryUser} />
      {intro.open && <IntroCard onClose={intro.close} />}
      {/* The story first: what's going on and what to do. Then the button that moves the world on.
          A new real-life scene pops up over the feed, but not on top of the intro. */}
      <StoryPanel story={story} fresh={fresh} onChosen={onChosen} popUp={!intro.open} />
      <WorldBar
        world={world}
        result={result}
        pending={pending}
        notice={notice}
        ticking={ticking}
        onTick={refresh}
        onOpenStory={setStoryUser}
      />
      <div>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} isNew={newPosts.has(post.id)} />
        ))}
      </div>
    </PullToRefresh>
  )
}

/**
 * After a tick that ended a chapter, or a choice in a scene, the director writes the
 * next chapter in the background (up to a minute). Reloads the feed while it's being
 * written, until it shows up. `trigger` is the tick result or choice that started the
 * wait. Returns whether the chapter now showing is the new one (for its "new" tag).
 */
function useNextChapter(trigger: unknown, story: StoryNow) {
  const { revalidate } = useRevalidator()
  const chapter = story.current?.id
  // The chapter when the wait started (any other one is the one we waited for), and the
  // story as loaded then: until the feed has reloaded once, the director may not have
  // started yet; after that, it waits only while the next chapter is being written.
  const [watch, setWatch] = useState<{
    trigger: unknown
    chapter: string | undefined
    story: StoryNow
    expired: boolean
  } | null>(null)
  if (trigger && watch?.trigger !== trigger) setWatch({ trigger, chapter, story, expired: false })

  const arrived = Boolean(watch && chapter && chapter !== watch.chapter)
  const writing = watch?.story === story || story.writing || !story.current
  const waiting = Boolean(watch && !arrived && !watch.expired && writing)

  // Give up after a while (the provider may be down; the next tick tries again).
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setWatch((w) => w && { ...w, expired: true }), CHAPTER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  // Runs again after every reload (story changes), scheduling the next one.
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => {
      clearCache()
      void revalidate()
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [waiting, story, revalidate])

  return arrived
}

/**
 * Posts and stories from the last tick that aren't in the feed yet. Reloads the feed
 * until they are, or until POLL_FOR_MS: then they're given up on (a story whose photo
 * couldn't be drawn is dropped), so they stop showing as "uploading...".
 */
function usePendingMedia(result: ActionResult<TickResult> | undefined, posts: Post[], groups: StoryGroup[]) {
  const { revalidate } = useRevalidator()
  const [expiredFor, setExpiredFor] = useState<unknown>(null)

  const inFeed = new Set([...posts.map((p) => p.id), ...groups.flatMap((g) => g.stories.map((s) => s.id))])
  const pending =
    result?.ok && expiredFor !== result
      ? result.data.events.flatMap((e) => {
          const id = e.type === 'post' ? e.postId : e.type === 'story' ? e.storyId : null
          return id && !inFeed.has(id) ? [id] : []
        })
      : []
  const key = pending.join(',')
  const waiting = key !== ''

  // Once per tick result (not per reload): the clock starts when its media starts pending.
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setExpiredFor(result), POLL_FOR_MS)
    return () => clearTimeout(timer)
  }, [waiting, result])

  // Runs again after every reload (posts changes), scheduling the next one.
  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => {
      clearCache()
      void revalidate()
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [key, posts, groups, revalidate])

  return new Set(pending)
}
