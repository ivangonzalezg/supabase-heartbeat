import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatRunTimestamp } from "./format-run-timestamp"

describe("formatRunTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T14:30:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns an em dash for a null input", () => {
    expect(formatRunTimestamp(null)).toBe("—")
  })

  it("prefixes today's timestamp with Today", () => {
    expect(formatRunTimestamp("2026-01-15T09:00:00.000Z")).toMatch(/^Today, /)
  })

  it("prefixes yesterday's timestamp with Yesterday", () => {
    expect(formatRunTimestamp("2026-01-14T16:16:00.000Z")).toMatch(
      /^Yesterday, /
    )
  })

  it("falls back to a month/day date for anything older", () => {
    expect(formatRunTimestamp("2026-01-10T09:00:00.000Z")).toMatch(/^Jan 10, /)
  })
})
