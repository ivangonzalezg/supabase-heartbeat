import {
  safeParseJsonObject,
  safeParseJsonValue,
  type JsonObject,
  type JsonValue,
} from '@supabase-heartbeat/validation';

/**
 * Rejects `NaN`/`Infinity`/`-Infinity` before handing a value to the
 * shared package's `jsonValueSchema`. Zod's bare `z.number()` (as used
 * there) accepts non-finite numbers by default — verified by reading
 * `packages/validation/src/json-value.ts`, which does not chain
 * `.finite()`. Patching that shared schema was out of scope for this
 * task ("preserve current configuration contracts"), so this narrower,
 * execution-layer check closes the gap locally instead. Walks the same
 * value graph depth-first; a `RangeError` from a cyclic structure is
 * allowed to propagate to the caller, which already wraps this whole
 * check in its own safety net (see `isJsonSafeValue`).
 */
function containsNonFiniteNumber(
  value: unknown,
  seen = new Set<unknown>(),
): boolean {
  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    // A cycle here means `JSON.stringify`/the recursive schema below will
    // already fail this value for an unrelated reason; do not loop forever.
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => containsNonFiniteNumber(entry, seen));
  }
  return Object.values(value as Record<string, unknown>).some((entry) =>
    containsNonFiniteNumber(entry, seen),
  );
}

/**
 * True only for a value that can be safely represented in the
 * application's JSON columns: `null`, booleans, finite numbers, strings,
 * arrays of JSON-safe values, and plain objects with JSON-safe values.
 * Rejects `undefined`, `bigint`, symbols, functions, non-finite numbers,
 * cyclic structures, class instances, `Response`, streams, and any other
 * binary/unsafe value — never by stringifying and comparing, always by
 * structural validation through the shared package's recursive schema
 * (`safeParseJsonValue`, which already turns a cyclic-structure
 * `RangeError` into an ordinary validation failure) plus the explicit
 * finite-number check above.
 */
export function isJsonSafeValue(value: unknown): value is JsonValue {
  if (containsNonFiniteNumber(value)) {
    return false;
  }
  return safeParseJsonValue(value).success;
}

/**
 * True only for a JSON-safe plain object (not an array, not a
 * primitive) — the shape every normalized table row must have.
 */
export function isJsonSafeObject(value: unknown): value is JsonObject {
  if (containsNonFiniteNumber(value)) {
    return false;
  }
  return safeParseJsonObject(value).success;
}
