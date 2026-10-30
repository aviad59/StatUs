// Hebrew date/time formatting for ISO timestamps from the API.

const relative = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

function relativeTime(iso: string, underAMinute: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    // ICU writes Hebrew dual forms with the number in brackets ("לפני שעתיים (2)"); drop it.
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit).replace(/\s*\(2\)$/, '')
  }
  return underAMinute
}

/** "לפני 5 דקות", "אתמול", "לפני שבוע"... */
export const timeAgo = (iso: string) => relativeTime(iso, 'עכשיו')

/** For future timestamps: "בעוד 12 דקות", "בעוד שעה"... */
export const timeUntil = (iso: string) => relativeTime(iso, 'בעוד רגע')

/** "18:05" */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
