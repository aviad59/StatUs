// Route actions (resource routes in router.tsx), submitted with useFetcher().
// After an action finishes, React Router reloads the page's loaders, so the feed,
// energy and DMs refresh on their own.

import type { ActionFunctionArgs } from 'react-router'
import { ApiError, post } from '@/api.ts'
import type {
  Comment,
  CreateCommentBody,
  Message,
  SendMessageBody,
  TickErrorCode,
  TickResult,
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

export async function tickAction({ request }: ActionFunctionArgs): Promise<ActionResult<TickResult>> {
  try {
    return { ok: true, data: await post<TickResult>('/world/tick', undefined, request.signal) }
  } catch (error) {
    return failure(error, 'משהו השתבש בהתקדמות העולם. נסו שוב.')
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
