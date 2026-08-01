import type { JsonValue } from '@supabase-heartbeat/validation';
import { parseStepOutputReference } from './step-output-reference.parser';
import { StepReferenceResolutionError } from './workflow-reference.errors';

/**
 * Property names never traversed during path resolution, regardless of
 * `Object.prototype.hasOwnProperty` — a `JsonValue` produced by
 * `JSON`-safe parsing (every executor output in this codebase; see
 * `execution-output/normalize-step-output.ts`) cannot itself carry an
 * *own* `__proto__`/`constructor`/`prototype` property, since those are
 * either inherited or, for `__proto__` specifically, an accessor on
 * `Object.prototype` rather than a plain data property most JSON
 * parsers would ever assign as "own". This denylist exists as a second,
 * independent layer of defense on top of the `hasOwnProperty` check
 * below — belt-and-braces, not a substitute for it — in case a future
 * output source ever behaves unexpectedly.
 */
const DANGEROUS_PROPERTY_NAMES = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

/**
 * Resolves one already-parsed reference's `path` against `output` (the
 * referenced step's stored successful output for this run). Every step
 * requires an **own** property (`Object.prototype.hasOwnProperty.call`)
 * — inherited properties (anything reachable only via the prototype
 * chain) are never resolved, so a path segment can never silently read
 * `Object.prototype.toString` or similar. `null` is a valid resolved
 * value when the path exists and is `null` — this function only throws
 * for a path that cannot be walked to completion; it never returns
 * `undefined`.
 */
/**
 * Exported solely so `resolve-step-references.spec.ts` can exercise this
 * function's own dangerous-segment/hasOwnProperty defense in depth
 * directly. Under normal operation `resolveStepReferences` is the only
 * caller: every reference string first passes through
 * `parseStepOutputReference`, which now also rejects a dangerous segment
 * at parse time (see `step-output-reference.parser.ts`) — so a reference
 * string built from ordinary user input can no longer reach this
 * function with a dangerous segment in its path. This function's own
 * check is kept regardless, as a second, independent layer that does not
 * assume the parser is the only path that can ever construct a `path`
 * array.
 */
export function resolvePath(
  output: JsonValue,
  path: ReadonlyArray<string | number>,
  onFailure: () => never,
): JsonValue {
  let current: JsonValue = output;

  for (const segment of path) {
    if (typeof segment === 'string' && DANGEROUS_PROPERTY_NAMES.has(segment)) {
      onFailure();
    }

    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        onFailure();
      }
      if (segment < 0 || segment >= current.length) {
        onFailure();
      }
      current = current[segment];
      continue;
    }

    // A string segment requires `current` to be a plain object (not an
    // array, not a primitive, not null) and the property to be present
    // as the object's own property — never inherited.
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      onFailure();
    }
    const container = current as Record<string, JsonValue>;
    if (!Object.prototype.hasOwnProperty.call(container, segment)) {
      onFailure();
    }
    current = container[segment];
  }

  return current;
}

/**
 * Run-local, in-memory record of every enabled step's successful output
 * for one workflow run, keyed by `stepKey`. Never persisted as a
 * separate database field, never shared across runs, never cached by
 * workflow — see `WorkflowRunsService` for how this map's lifetime is
 * scoped to exactly one `executeManual` call.
 */
export type StepOutputStore = ReadonlyMap<string, JsonValue>;

/**
 * Recursively clones `configuration`, replacing every whole-value
 * reference with its resolved value from `outputs`, and leaving every
 * other value (including a string that is not a reference at all)
 * unchanged. Never mutates `configuration` or any entry in `outputs` —
 * every object/array on the path from the root to a replaced reference
 * is freshly constructed; only unchanged subtrees may be structurally
 * shared with the input (a plain value copy either way, since
 * `JsonValue` is always immutable-by-convention primitives/arrays/
 * objects, never a class instance).
 *
 * Throws `StepReferenceResolutionError` (never returns `undefined`,
 * never silently drops a step) when:
 * - the referenced `stepKey` has no entry in `outputs` (the referenced
 *   step did not run in this scope, or is the current step during a
 *   defensive resolver-level check — the structural validator should
 *   have already rejected this case, but this function reasserts safety
 *   in isolation rather than trusting a pre-condition silently);
 * - the path cannot be walked to completion for the reason described in
 *   `resolvePath` above (missing property, missing index, indexing a
 *   non-array, property access on a primitive, dangerous segment).
 *
 * `stepKey` (the *consuming* step's own key) is passed in only to build
 * a safe error message identifying which step failed to resolve — it is
 * never itself looked up in `outputs`.
 */
export function resolveStepReferences(
  stepKey: string,
  configuration: JsonValue,
  outputs: StepOutputStore,
): JsonValue {
  function resolveValue(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
      const reference = parseStepOutputReference(value);
      if (!reference) {
        return value;
      }

      const referencedOutput = outputs.get(reference.stepKey);
      if (referencedOutput === undefined) {
        throw new StepReferenceResolutionError({
          stepKey,
          referencedStepKey: reference.stepKey,
          path: reference.path,
        });
      }

      return resolvePath(referencedOutput, reference.path, () => {
        throw new StepReferenceResolutionError({
          stepKey,
          referencedStepKey: reference.stepKey,
          path: reference.path,
        });
      });
    }

    if (Array.isArray(value)) {
      return value.map((entry) => resolveValue(entry));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, JsonValue> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = resolveValue(entry);
      }
      return result;
    }

    return value;
  }

  return resolveValue(configuration);
}
