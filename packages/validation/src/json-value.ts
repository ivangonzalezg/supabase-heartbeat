import { z } from 'zod';

/**
 * A JSON-serializable value: string, number, boolean, null, a JSON object,
 * or a JSON array. Rejects functions, class instances, `undefined`,
 * symbols, and (structurally, since Zod validates depth-first on a real
 * value graph) cyclic structures, which can never satisfy this recursive
 * shape in finite time and are instead caught by the `JSON.stringify`
 * check callers apply for genuinely circular objects — see `isJsonValue`.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * A JSON object specifically (not an array, not a primitive) — the shape
 * every step's `configuration` root must have.
 */
export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export type JsonObject = z.infer<typeof jsonObjectSchema>;

/**
 * `jsonValueSchema`/`jsonObjectSchema`'s recursive definition walks the
 * actual value graph rather than a fixed schema depth, so a
 * self-referencing input causes infinite recursion — Zod's `safeParse`
 * does not catch this itself; it throws a raw `RangeError` ("Maximum
 * call stack size exceeded"). These wrappers catch exactly that failure
 * mode and report it as an ordinary validation failure instead of an
 * uncaught exception, since a cyclic structure can never be valid JSON.
 */
export function safeParseJsonValue(
  value: unknown,
): ReturnType<typeof jsonValueSchema.safeParse> {
  try {
    return jsonValueSchema.safeParse(value);
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonValueSchema.safeParse(undefined);
    }
    throw error;
  }
}

export function safeParseJsonObject(
  value: unknown,
): ReturnType<typeof jsonObjectSchema.safeParse> {
  try {
    return jsonObjectSchema.safeParse(value);
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonObjectSchema.safeParse(undefined);
    }
    throw error;
  }
}
