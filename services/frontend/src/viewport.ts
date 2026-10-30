import { useSyncExternalStore } from 'react'

// The part of the screen the user can actually see. When the on-screen keyboard opens,
// phones shrink this "visual viewport" (iOS also pans it), while the page's layout
// stays full height, so anything sized to the page ends up behind the keyboard. Full-
// screen views with an input at the bottom (a chat) size themselves to this instead.

const subscribe = (onChange: () => void) => {
  const viewport = window.visualViewport
  window.addEventListener('resize', onChange)
  viewport?.addEventListener('resize', onChange)
  viewport?.addEventListener('scroll', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    viewport?.removeEventListener('resize', onChange)
    viewport?.removeEventListener('scroll', onChange)
  }
}

// A string, so React compares snapshots by value (an object would be new every read).
const snapshot = () => {
  const viewport = window.visualViewport
  return `${Math.round(viewport?.height ?? window.innerHeight)},${Math.round(viewport?.offsetTop ?? 0)}`
}

/** Height of the visible screen (above the keyboard, if it's open) and how far it's panned down, in px. */
export function useVisualViewport() {
  const [height, offsetTop] = useSyncExternalStore(subscribe, snapshot).split(',').map(Number)
  return { height, offsetTop }
}
