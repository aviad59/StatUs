import { ArrowDown, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

const THRESHOLD = 70 // px of (damped) pull needed to trigger
const MAX_PULL = 110
const DAMPING = 0.5 // content moves half as far as the finger, like iOS

/**
 * Instagram-style pull-to-refresh: drag down while scrolled to the top, release past
 * the threshold to call `onRefresh`. Works with touch, and with a mouse drag for desktop.
 */
export function PullToRefresh({
  onRefresh,
  refreshing,
  label,
  children,
}: {
  onRefresh: () => void
  refreshing: boolean
  /** Text under the spinner while refreshing. */
  label: string
  children: ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const begin = (y: number) => {
      if (window.scrollY > 0) return
      startY.current = y
      setDragging(true)
    }
    const move = (y: number, event: Event) => {
      if (startY.current === null) return
      const distance = (y - startY.current) * DAMPING
      if (distance <= 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      // Stop the page (and the browser's own pull-to-reload) from moving instead.
      if (event.cancelable) event.preventDefault()
      pullRef.current = Math.min(distance, MAX_PULL)
      setPull(pullRef.current)
    }
    const end = () => {
      if (startY.current === null) return
      startY.current = null
      setDragging(false)
      if (pullRef.current >= THRESHOLD) onRefreshRef.current()
      pullRef.current = 0
      setPull(0)
    }

    const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY)
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientY, e)
    const onMouseDown = (e: MouseEvent) => {
      // Ignore clicks on controls, so inputs and buttons keep working.
      if (e.button === 0 && !(e.target as Element).closest('input, button, a, textarea')) {
        begin(e.clientY)
      }
    }
    const onMouseMove = (e: MouseEvent) => move(e.clientY, e)

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', end)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', end)
    }
  }, [])

  const ready = pull >= THRESHOLD
  const height = refreshing ? 56 : pull

  return (
    <div className={pull > 0 ? 'select-none' : undefined}>
      <div
        className="flex items-end justify-center overflow-hidden text-neutral-500"
        style={{ height, transition: dragging ? undefined : 'height 200ms ease-out' }}
        aria-live="polite"
      >
        <div className="flex flex-col items-center pb-2 text-xs">
          {refreshing ? (
            <>
              <Loader2 size={22} className="animate-spin" />
              <span className="pt-1">{label}</span>
            </>
          ) : (
            pull > 0 && (
              <ArrowDown
                size={22}
                className="transition-transform"
                style={{ transform: ready ? 'rotate(180deg)' : undefined }}
              />
            )
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
