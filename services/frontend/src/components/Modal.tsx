import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '@/overlay.ts'

/**
 * A card over a dimmed page, closed with X, Escape or a tap outside it. Rendered into
 * <body>, since the feed's pull-to-refresh wrapper would otherwise keep it under the nav.
 */
export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useOverlay(onClose)
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-full w-full max-w-md animate-[pop-in_300ms_ease-out] overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className="absolute end-3 top-3 z-10 rounded-full bg-white/80 p-1 text-neutral-600 dark:bg-neutral-900/80 dark:text-neutral-300"
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
