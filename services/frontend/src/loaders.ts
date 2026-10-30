// Route loaders (wired up in router.tsx). Pages read the result with useLoaderData<typeof xxxLoader>().

import { type LoaderFunctionArgs, useRouteLoaderData } from 'react-router'
import { ApiError, api } from '@/api.ts'
import type {
  Conversation,
  ConversationSummary,
  PlayerStats,
  Post,
  Profile,
  StoryGroup,
  StoryNow,
  User,
  WorldStatus,
} from '@/types.ts'

// Responses are kept for a while so switching tabs is instant, like a native app.
// Data only changes through the user's own actions (ticks, comments, DMs), which
// clear the cache (see actions.ts); the time limit catches energy regenerating.
const CACHE_MS = 60_000
const cache = new Map<string, { at: number; data: Promise<unknown> }>()

function cached<T>(path: string): Promise<T> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as Promise<T>
  // No abort signal: the request is shared by everyone who reads this cache entry.
  const data = api<T>(path)
  cache.set(path, { at: Date.now(), data })
  data.catch(() => cache.delete(path))
  return data
}

/** Forget cached responses, so the next load fetches fresh data. */
export const clearCache = () => cache.clear()

/** Loads the main tabs in the background, so the first switch to them is instant too. */
export function prefetchTabs() {
  void Promise.all([feedLoader(), messagesLoader(), profileLoader()]).catch(() => {})
}

/** The current user, and how many conversations have unread messages (the nav badge). */
export async function rootLoader({ request }: LoaderFunctionArgs) {
  const [user, stats, conversations] = await Promise.all([
    api<User>('/me', { signal: request.signal }),
    api<PlayerStats>('/me/stats', { signal: request.signal }),
    cached<ConversationSummary[]>('/conversations'),
  ])
  return { user, stats, unread: conversations.filter((c) => c.unread).length }
}

/** The signed-in user, loaded once by the root route. */
export const useCurrentUser = () => useRouteLoaderData<typeof rootLoader>('root')!.user

/** Aura, humor and drama; every action the user takes changes them. */
export const useStats = () => useRouteLoaderData<typeof rootLoader>('root')!.stats

/** Conversations with messages the user hasn't seen yet. */
export const useUnreadCount = () => useRouteLoaderData<typeof rootLoader>('root')!.unread

export async function feedLoader() {
  const [posts, storyGroups, world, story] = await Promise.all([
    cached<Post[]>('/feed'),
    cached<StoryGroup[]>('/stories'),
    cached<WorldStatus>('/world'),
    cached<StoryNow>('/story'),
  ])
  return { posts, storyGroups, world, story }
}

/** The current user's own posts, for the profile grid. */
export const profileLoader = () => cached<Post[]>('/me/posts')

/** Someone's profile page (an agent's). Resolves to null for an unknown username. */
export async function userLoader({ params }: LoaderFunctionArgs) {
  try {
    return await cached<Profile>(`/accounts/${encodeURIComponent(params.username ?? '')}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Conversations, plus everyone you can message (the row of people above them). */
export async function messagesLoader() {
  const [conversations, people] = await Promise.all([
    cached<ConversationSummary[]>('/conversations'),
    cached<User[]>('/accounts'),
  ])
  return { conversations, people }
}

/** An article on Pull, the made-up news site (static, see services/backend/src/news). */
export interface NewsArticle {
  slug: string
  category: string
  title: string
  subtitle: string
  lead: string
  image: string
  /** When it was "published": always recent, counted back from now. */
  publishedAt: string
}

/**
 * Pull's articles: a static file made ahead of time with their photos
 * (`pnpm --filter @status/backend news:generate`), served from /news. Not the API.
 */
export async function newsLoader() {
  const response = await fetch('/news/articles.json')
  if (!response.ok) throw new Error(`GET /news/articles.json failed with ${response.status}`)
  const articles = (await response.json()) as (Omit<NewsArticle, 'publishedAt'> & { hoursAgo: number })[]
  const now = Date.now()
  return articles.map(({ hoursAgo, ...article }) => ({
    ...article,
    publishedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  }))
}

/** Resolves to null when the conversation doesn't exist (or the id is malformed). */
export async function conversationLoader({ params }: LoaderFunctionArgs) {
  try {
    const [conversation, world] = await Promise.all([
      cached<Conversation>(`/conversations/${params.id}`),
      cached<WorldStatus>('/world'),
    ])
    return { conversation, world }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}
