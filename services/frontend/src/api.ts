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

// Reads are retried once after this long on a network error or a server error: a
// single dropped request shouldn't turn the whole app into the error page. Writes
// aren't, since sending one twice could post twice.
const READ_RETRY_MS = 800

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const isRead = !init?.method || init.method === 'GET'
  const retry = () => new Promise((resolve) => setTimeout(resolve, READ_RETRY_MS)).then(() => fetch(url, init))
  try {
    const response = await fetch(url, init)
    return isRead && response.status >= 500 ? await retry() : response
  } catch (error) {
    if (!isRead || init?.signal?.aborted) throw error
    return retry()
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(`/api${path}`, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null
    throw new ApiError(response.status, init?.method ?? 'GET', path, body?.code)
  }
  if (response.status === 204) return undefined as T
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

/** POST multipart/form-data (file uploads). The browser sets the Content-Type boundary. */
export const postForm = <T>(path: string, body: FormData, signal?: AbortSignal) =>
  api<T>(path, { method: 'POST', body, signal })
