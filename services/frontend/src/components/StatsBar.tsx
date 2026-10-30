import { Flame, Laugh, type LucideIcon, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStats } from '@/loaders.ts'
import type { PlayerStats } from '@/types.ts'

type Stat = 'aura' | 'humor' | 'drama'

const STATS: { key: Stat; label: string; icon: LucideIcon; color: string }[] = [
  { key: 'aura', label: 'אאורה', icon: Sparkles, color: 'bg-violet-500' },
  { key: 'humor', label: 'הומור', icon: Laugh, color: 'bg-amber-400' },
  { key: 'drama', label: 'דרמה', icon: Flame, color: 'bg-rose-500' },
]

/** The user's three stats as meters (the profile). */
export function StatsBar() {
  const stats = useStats()

  return (
    <ul className="w-full max-w-xs space-y-2">
      {STATS.map(({ key, label, icon: Icon, color }) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <Icon size={16} className="shrink-0" />
          <span className="w-12 shrink-0">{label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" aria-hidden>
            <span className={`block h-full rounded-full transition-all ${color}`} style={{ width: `${stats[key]}%` }} />
          </span>
          <span className="w-7 text-end font-semibold tabular-nums">{stats[key].toLocaleString('he-IL')}</span>
        </li>
      ))}
    </ul>
  )
}

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('he-IL')}`

const TOAST_MS = 2500

/** After each action, briefly shows what it did to the stats ("+3 הומור · הומור"). */
export function StatsToast() {
  const stats = useStats()
  const seen = useRef(stats.last?.at)
  const [shown, setShown] = useState<PlayerStats['last']>(null)

  useEffect(() => {
    // Only changes made while the app is open: not the one that was there on load.
    if (!stats.last || stats.last.at === seen.current) return
    seen.current = stats.last.at
    setShown(stats.last)
    const timer = setTimeout(() => setShown(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [stats.last])

  if (!shown) return null
  const changes = STATS.filter(({ key }) => shown[key] !== 0)

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-16 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg dark:bg-neutral-100/90 dark:text-neutral-900"
    >
      {changes.map(({ key, label, icon: Icon }) => (
        <span key={key} className="flex items-center gap-1">
          <Icon size={14} />
          <span dir="ltr" className="font-semibold tabular-nums">{signed(shown[key])}</span>
          {label}
        </span>
      ))}
      <span className="opacity-70">· {shown.reason}</span>
    </div>
  )
}
