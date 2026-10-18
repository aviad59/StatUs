import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import type { ActionResult } from '@/actions.ts'

/**
 * A one-line input + send button that submits `text` to an action. The input clears
 * as soon as you send (pair it with usePendingTexts for an optimistic preview) and
 * gets the text back if sending fails.
 */
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
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSent = useRef('')

  useEffect(() => {
    const input = inputRef.current
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok && input && !input.value) {
      input.value = lastSent.current
    }
  }, [fetcher.state, fetcher.data])

  return (
    <fetcher.Form
      method="post"
      action={action}
      className={className}
      onSubmit={() => {
        const input = inputRef.current
        if (!input) return
        lastSent.current = input.value
        // Clear after React Router has read the form data.
        setTimeout(() => (input.value = ''))
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          name="text"
          required
          maxLength={1000}
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm dark:border-neutral-700"
        />
        <button type="submit" className="text-sm font-semibold text-blue-500">
          {submitLabel}
        </button>
      </div>
      {fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok && (
        <p className="pt-1 text-xs text-red-500">{fetcher.data.error}</p>
      )}
    </fetcher.Form>
  )
}

