// Thin fetch wrapper for the backend. In dev, Vite proxies /api to the backend (see vite.config.ts).

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, path: string) {
    super(`GET /api${path} failed with ${status}`)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) throw new ApiError(response.status, path)
  return response.json() as Promise<T>
}
