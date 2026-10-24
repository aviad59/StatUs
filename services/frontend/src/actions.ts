// Route actions (resource routes in router.tsx), submitted with useFetcher().
// After an action finishes, React Router reloads the page's loaders, so the feed,
// energy and DMs refresh on their own.

import { type ActionFunctionArgs, redirect, useFetchers } from 'react-router'
import { ApiError, patch, post, postForm, put } from '@/api.ts'
import type {
  Comment,
  CreateCommentBody,
  Gender,
  LikeBody,
  LikeResult,
  Message,
  Post,
  ReplyResult,
  SendMessageBody,
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

export async function updateProfileAction({ request }: ActionFunctionArgs): Promise<ActionResult<User>> {
  const gender = (await request.formData()).get('gender')
  if (gender !== 'male' && gender !== 'female') return { ok: false, error: 'בחירה לא תקינה' }
  const body: UpdateMeBody = { gender: gender satisfies Gender }
  try {
    return { ok: true, data: await patch<User>('/me', body) }
  } catch (error) {
    return failure(error, 'לא הצלחנו לשמור את השינוי')
  }
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
  if (!(form.get('image') instanceof Blob)) return { ok: false, error: 'צריך לבחור תמונה' } as const
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
