/**
 * Relative-day timestamp formatting shared by the operational-summary
 * card's `lastRun`/`nextRun` values and the recent-runs table's
 * `startedAt` column: `"Today, 09:00 AM"`, `"Yesterday, 04:16 PM"`, or
 * `"Jan 10, 09:00 AM"` for anything older. No existing precedent in
 * this codebase — net-new for this page.
 */
export function formatRunTimestamp(iso: string | null): string {
  if (iso === null) return "—"

  const date = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })

  if (isSameDay(date, now)) return `Today, ${time}`
  if (isSameDay(date, yesterday)) return `Yesterday, ${time}`
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`
}
