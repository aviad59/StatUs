// Thin fetch wrapper for the backend. In dev, Vite proxies /api to the backend (see vite.config.ts).

export class ApiError extends Error {
  readonly status: number
  /** Machine-readable error code from the response body, when the backend sends one. */
  readonly code: string | undefined

  constructor(status: number, method: string, path: string, code?: string) {
    super(`${method} /api${path} failed with ${status}${code ? ` (${code})` : ''}`)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null
    throw new ApiError(response.status, init?.method ?? 'GET', path, body?.code)
  }
  return response.json() as Promise<T>
}

const send =
  (method: 'POST' | 'PATCH' | 'PUT') =>
  <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    api<T>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })

export const post = send('POST')
export const patch = send('PATCH')
export const put = send('PUT')
