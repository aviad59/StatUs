// Small per-device memory: which stories you've watched, and which hints you've closed.
// Kept in localStorage, which can be missing or blocked (private mode), so every access
// is guarded and the app works the same without it, just forgetting between visits.

import { useState } from 'react'

const read = (key: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const write = (key: string, values: Set<string>) => {
  try {
    localStorage.setItem(key, JSON.stringify([...values]))
  } catch {
    // Storage unavailable: remember for this visit only (the in-memory sets below).
  }
}

const STORIES_KEY = 'status.seenStories'
// Stories expire after a day, so old ids are dropped to keep the list short.
const MAX_SEEN_STORIES = 300
const seenStories = read(STORIES_KEY)

export const isStorySeen = (id: string) => seenStories.has(id)

export function markStorySeen(id: string) {
  if (seenStories.has(id)) return
  seenStories.add(id)
  while (seenStories.size > MAX_SEEN_STORIES) seenStories.delete(seenStories.values().next().value!)
  write(STORIES_KEY, seenStories)
}

const HINTS_KEY = 'status.dismissedHints'
const dismissedHints = read(HINTS_KEY)

export const isHintDismissed = (hint: string) => dismissedHints.has(hint)

export function dismissHint(hint: string) {
  dismissedHints.add(hint)
  write(HINTS_KEY, dismissedHints)
}

// Versioned: a new concept brings the intro back for people who closed the old one.
const INTRO_HINT = 'intro-secrets'

/** Whether the intro card is still showing (the feed holds pop-ups back until it's closed). */
export function useIntro() {
  const [open, setOpen] = useState(() => !isHintDismissed(INTRO_HINT))
  const close = () => {
    dismissHint(INTRO_HINT)
    setOpen(false)
  }
  return { open, close }
}
