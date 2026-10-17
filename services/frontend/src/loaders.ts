// Route loaders (wired up in router.tsx). Pages read the result with useLoaderData<typeof xxxLoader>().

import { type LoaderFunctionArgs, useRouteLoaderData } from 'react-router'
import { ApiError, api } from '@/api.ts'
import type { Conversation, ConversationSummary, Post, StoryGroup, User } from '@/types.ts'

export const rootLoader = ({ request }: LoaderFunctionArgs) =>
  api<User>('/me', { signal: request.signal })

/** The signed-in user, loaded once by the root route. */
export const useCurrentUser = () => useRouteLoaderData<typeof rootLoader>('root')!

export async function feedLoader({ request }: LoaderFunctionArgs) {
  const [posts, storyGroups] = await Promise.all([
    api<Post[]>('/feed', { signal: request.signal }),
    api<StoryGroup[]>('/stories', { signal: request.signal }),
  ])
  return { posts, storyGroups }
}

export const messagesLoader = ({ request }: LoaderFunctionArgs) =>
  api<ConversationSummary[]>('/conversations', { signal: request.signal })

/** Resolves to null when the conversation doesn't exist (or the id is malformed). */
export async function conversationLoader({ params, request }: LoaderFunctionArgs) {
  try {
    return await api<Conversation>(`/conversations/${params.id}`, { signal: request.signal })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}
