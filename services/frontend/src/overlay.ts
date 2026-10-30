import { useEffect } from 'react'

/** Keeps the page behind a full-screen view from scrolling, and closes it on Escape. */
export function useOverlay(onClose: () => void) {
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
}
