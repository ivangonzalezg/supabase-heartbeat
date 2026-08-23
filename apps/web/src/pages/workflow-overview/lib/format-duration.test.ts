import { describe, expect, it } from "vitest"
import { formatDuration } from "./format-duration"

describe("formatDuration", () => {
  it("returns null for a null input", () => {
    expect(formatDuration(null)).toBeNull()
  })

  it("formats sub-second durations in milliseconds", () => {
    expect(formatDuration(320)).toBe("320ms")
  })

  it("formats durations under a minute in seconds with one decimal", () => {
    expect(formatDuration(3600)).toBe("3.6s")
  })

  it("formats durations of a minute or more as minutes and seconds", () => {
    expect(formatDuration(80000)).toBe("1m 20s")
  })

  it("formats durations of an hour or more as hours and minutes", () => {
    expect(formatDuration(7500000)).toBe("2h 5m")
  })
})
