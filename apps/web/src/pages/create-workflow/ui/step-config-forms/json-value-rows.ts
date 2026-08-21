import type { KeyValueRow } from "@/shared/ui"

export function toRows(
  obj: Record<string, unknown> | undefined
): KeyValueRow[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return []
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: stringifyJsonValue(value),
  }))
}

export function fromRows(rows: KeyValueRow[]): Record<string, unknown> {
  return Object.fromEntries(
    rows
      .filter((row) => row.key.trim().length > 0)
      .map((row) => [row.key, parseJsonValue(row.value)])
  )
}

/**
 * Best-effort parse of a raw text input into a JSON-compatible value —
 * `"42"` becomes the number 42, `"true"` becomes the boolean, `"null"`
 * becomes null — so values that reach the backend as `filter.value` or a
 * column value are typed correctly instead of always being strings (e.g.
 * an `.eq()` filter against an integer column needs a number, not
 * `"42"`). Falls back to the raw string when it isn't valid JSON, since
 * plain text (like a UUID or a template reference) is the common case.
 */
export function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function stringifyJsonValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}
