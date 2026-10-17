import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import type { ActionResult } from '@/actions.ts'

/** A one-line input + send button that submits `text` to an action and clears on success. */
export function TextForm({
  action,
  placeholder,
  submitLabel,
  className = '',
}: {
  action: string
  placeholder: string
  submitLabel: string
  className?: string
}) {
  const fetcher = useFetcher<ActionResult<unknown>>()
  const formRef = useRef<HTMLFormElement>(null)
  const busy = fetcher.state !== 'idle'

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) formRef.current?.reset()
  }, [fetcher.state, fetcher.data])

  return (
    <fetcher.Form ref={formRef} method="post" action={action} className={className}>
      <div className="flex items-center gap-2">
        <input
          name="text"
          required
          maxLength={1000}
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy}
          className="text-sm font-semibold text-blue-500 disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
      {fetcher.data && !fetcher.data.ok && (
        <p className="pt-1 text-xs text-red-500">{fetcher.data.error}</p>
      )}
    </fetcher.Form>
  )
}
