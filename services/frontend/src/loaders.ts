// Route loaders (wired up in router.tsx). Pages read the result with useLoaderData<typeof xxxLoader>().

import { type LoaderFunctionArgs, useRouteLoaderData } from 'react-router'
import { ApiError, api } from '@/api.ts'
import type {
  Conversation,
  ConversationSummary,
  Post,
  StoryGroup,
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

export const rootLoader = ({ request }: LoaderFunctionArgs) =>
  api<User>('/me', { signal: request.signal })

/** The signed-in user, loaded once by the root route. */
export const useCurrentUser = () => useRouteLoaderData<typeof rootLoader>('root')!

export async function feedLoader() {
  const [posts, storyGroups, world] = await Promise.all([
    cached<Post[]>('/feed'),
    cached<StoryGroup[]>('/stories'),
    cached<WorldStatus>('/world'),
  ])
  return { posts, storyGroups, world }
}

export const messagesLoader = () => cached<ConversationSummary[]>('/conversations')

/** The current user's own posts, for the profile grid. */
export const profileLoader = () => cached<Post[]>('/me/posts')

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
