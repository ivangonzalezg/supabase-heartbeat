import humanizeDuration from "humanize-duration"

const compactHumanizer = humanizeDuration.humanizer({
  units: ["h", "m", "s"],
  round: true,
  largest: 2,
  spacer: "",
  delimiter: " ",
  language: "shortEn",
  languages: {
    shortEn: { h: () => "h", m: () => "m", s: () => "s" },
  },
})

/**
 * Compact duration formatting (`"3.6s"`, `"1m 20s"`, `"2h 5m"`) shared by
 * the operational-summary card's aggregate value and the recent-runs
 * table's per-row value. Sub-second durations render in milliseconds
 * (`"320ms"`) rather than being rounded to `"0s"`, which `round`+`largest`
 * alone would otherwise produce and which would misleadingly read as "no
 * time elapsed."
 */
export function formatDuration(ms: number | null): string | null {
  if (ms === null) return null
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return compactHumanizer(ms)
}
