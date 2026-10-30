// Route actions (resource routes in router.tsx), submitted with useFetcher().
// After an action finishes, React Router reloads the page's loaders, so the feed,
// energy and DMs refresh on their own.

import { type ActionFunctionArgs, redirect, useFetchers } from 'react-router'
import { ApiError, patch, post, postForm, put } from '@/api.ts'
import type {
  ChooseSceneBody,
  Comment,
  CreateCommentBody,
  Gender,
  LikeBody,
  LikeResult,
  Message,
  Post,
  ReplyResult,
  Scene,
  SendMessageBody,
  StartConversationBody,
  StartConversationResult,
  StoryReplyResult,
  TickErrorCode,
  TickResult,
  UpdateMeBody,
  User,
} from '@/types.ts'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const TICK_ERRORS: Record<TickErrorCode, string> = {
  NO_ENERGY: 'נגמרה האנרגיה. היא מתמלאת לאט עם הזמן.',
  TICK_IN_PROGRESS: 'העולם כבר מתקדם, רק רגע...',
}

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof ApiError && error.code && error.code in TICK_ERRORS) {
    return { ok: false, error: TICK_ERRORS[error.code as TickErrorCode] }
  }
  console.error(error)
  return { ok: false, error: fallback }
}

const text = async (request: Request) =>
  String((await request.formData()).get('text') ?? '').trim()

/** The welcome screen: the user picks how the characters address them (once), then on to the feed. */
export async function chooseGenderAction({ request }: ActionFunctionArgs) {
  const gender = (await request.formData()).get('gender')
  if (gender !== 'male' && gender !== 'female') return { ok: false, error: 'בחירה לא תקינה' } as const
  const body: UpdateMeBody = { gender: gender satisfies Gender }
  try {
    await patch<User>('/me', body)
  } catch (error) {
    return failure(error, 'לא הצלחנו לשמור את הבחירה. נסו שוב.')
  }
  return redirect('/')
}

export async function tickAction({ request }: ActionFunctionArgs): Promise<ActionResult<TickResult>> {
  try {
    return { ok: true, data: await post<TickResult>('/world/tick', undefined, request.signal) }
  } catch (error) {
    return failure(error, 'משהו השתבש בהתקדמות העולם. נסו שוב.')
  }
}

/** Shares a new post: the form has `image` (already resized, see image.ts) and `caption`. Goes to the feed. */
export async function createPostAction({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  if (!(form.get('image') instanceof Blob) && !String(form.get('caption') ?? '').trim()) {
    return { ok: false, error: 'צריך תמונה או טקסט' } as const
  }
  try {
    await postForm<Post>('/posts', form, request.signal)
  } catch (error) {
    return failure(error, 'לא הצלחנו לשתף את הפוסט. נסו שוב.')
  }
  return redirect('/')
}

/** Likes or unlikes a post; the form sends `liked` as "true" or "false". */
export async function likeAction({ params, request }: ActionFunctionArgs): Promise<ActionResult<LikeResult>> {
  const body: LikeBody = { liked: (await request.formData()).get('liked') === 'true' }
  try {
    return { ok: true, data: await put<LikeResult>(`/posts/${params.id}/like`, body) }
  } catch (error) {
    return failure(error, 'לא הצלחנו לעדכן את הלייק')
  }
}

/** The user opened a conversation, so its messages are seen (clears the unread badge). */
export async function readAction({ params }: ActionFunctionArgs): Promise<ActionResult<null>> {
  try {
    await put<void>(`/conversations/${params.id}/read`)
    return { ok: true, data: null }
  } catch (error) {
    return failure(error, 'לא הצלחנו לעדכן את ההודעות')
  }
}

export async function commentAction({
  params,
  request,
}: ActionFunctionArgs): Promise<ActionResult<Comment>> {
  const body: CreateCommentBody = { text: await text(request) }
  if (!body.text) return { ok: false, error: 'התגובה ריקה' }
  try {
    return { ok: true, data: await post<Comment>(`/posts/${params.id}/comments`, body) }
  } catch (error) {
    return failure(error, 'לא הצלחנו לפרסם את התגובה')
  }
}

export async function sendMessageAction({
  params,
  request,
}: ActionFunctionArgs): Promise<ActionResult<Message>> {
  const body: SendMessageBody = { text: await text(request) }
  if (!body.text) return { ok: false, error: 'ההודעה ריקה' }
  try {
    return { ok: true, data: await post<Message>(`/conversations/${params.id}/messages`, body) }
  } catch (error) {
    return failure(error, 'לא הצלחנו לשלוח את ההודעה')
  }
}

/**
 * Replies to an agent's story with a DM, then opens that conversation, where the agent
 * answers right away (ConversationPage). Costs like any DM.
 */
export async function storyReplyAction({ params, request }: ActionFunctionArgs) {
  const body: SendMessageBody = { text: await text(request) }
  if (!body.text) return { ok: false, error: 'ההודעה ריקה' } as const
  try {
    const { conversationId } = await post<StoryReplyResult>(`/stories/${params.id}/reply`, body)
    return redirect(`/messages/${conversationId}`)
  } catch (error) {
    return failure(error, 'לא הצלחנו לשלוח את ההודעה')
  }
}

/** The user decides in a scene ("what do we do?"); the story moves on from their choice. Free. */
export async function chooseSceneAction({ params, request }: ActionFunctionArgs): Promise<ActionResult<Scene>> {
  const body: ChooseSceneBody = { choice: String((await request.formData()).get('choice') ?? '') }
  try {
    return { ok: true, data: await post<Scene>(`/scenes/${params.id}/choose`, body) }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ALREADY_CHOSEN') {
      return { ok: false, error: 'כבר הוחלט כאן' }
    }
    return failure(error, 'לא הצלחנו לשמור את הבחירה. נסו שוב.')
  }
}

/** Opens the DM thread with an agent (from their profile or the people row), creating it if needed. Free. */
export async function startConversationAction({ params }: ActionFunctionArgs) {
  const body: StartConversationBody = { username: params.username ?? '' }
  try {
    const { conversationId } = await post<StartConversationResult>('/conversations', body)
    return redirect(`/messages/${conversationId}`)
  } catch (error) {
    return failure(error, 'לא הצלחנו לפתוח את השיחה')
  }
}

// Never answer faster than this, so the "typing..." bubble has time to show.
const MIN_REPLY_MS = 3000

/** Asks the agent to answer the last DM now (see ConversationPage for the online/typing states). */
export async function replyAction({ params, request }: ActionFunctionArgs): Promise<ActionResult<ReplyResult>> {
  try {
    const [data] = await Promise.all([
      post<ReplyResult>(`/conversations/${params.id}/reply`, undefined, request.signal),
      new Promise((resolve) => setTimeout(resolve, MIN_REPLY_MS)),
    ])
    return { ok: true, data }
  } catch (error) {
    return failure(error, 'לא הצלחנו לקבל תשובה')
  }
}

/** Texts currently being sent to `action`, for showing them before the server confirms. */
export function usePendingTexts(action: string): string[] {
  return useFetchers()
    .filter((f) => f.formAction === action && f.formData)
    .map((f) => String(f.formData?.get('text') ?? '').trim())
    .filter(Boolean)
}
