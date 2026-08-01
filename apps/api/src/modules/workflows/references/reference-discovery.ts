import type { JsonValue } from '@supabase-heartbeat/validation';
import {
  containsReferenceSyntax,
  parseStepOutputReference,
  type StepOutputReference,
} from './step-output-reference.parser';

/**
 * One reference found somewhere inside a step's configuration, together
 * with the path (from the configuration root) where it was found — used
 * to build useful, safe error messages such as `configuration.filter.value`
 * without ever including the configuration's actual values.
 */
export interface DiscoveredReference {
  readonly configurationPath: ReadonlyArray<string | number>;
  readonly reference: StepOutputReference;
}

/**
 * A string value that contains reference syntax (`${steps.`) but is not
 * itself one complete, well-formed, whole-value reference — either
 * because it embeds a reference inside a larger string (partial
 * interpolation, not supported in this task) or because the reference
 * syntax itself is malformed. Both are reported the same way here: the
 * caller (the structural validator) decides how to turn this into a
 * safe `InvalidStepReferenceSyntaxError`.
 */
export interface MalformedReferenceCandidate {
  readonly configurationPath: ReadonlyArray<string | number>;
}

export interface ReferenceDiscoveryResult {
  readonly references: readonly DiscoveredReference[];
  readonly malformed: readonly MalformedReferenceCandidate[];
}

/**
 * Recursively walks a step's configuration value (already known to be
 * `JsonValue` — every configuration schema in this codebase is JSON-safe
 * end to end) and reports every whole-value reference found, plus every
 * string that contains reference syntax without being a valid
 * whole-value reference. Does not build a generic templating engine:
 * this only classifies each string leaf as "not a reference" (ignored),
 * "a complete valid reference" (reported in `references`), or
 * "reference-like but invalid" (reported in `malformed`) — it never
 * modifies or resolves anything, and never treats a non-string value as
 * a candidate (a reference is only ever a whole string).
 */
export function discoverStepOutputReferences(
  configuration: JsonValue,
): ReferenceDiscoveryResult {
  const references: DiscoveredReference[] = [];
  const malformed: MalformedReferenceCandidate[] = [];

  function walk(value: JsonValue, path: Array<string | number>): void {
    if (typeof value === 'string') {
      if (!containsReferenceSyntax(value)) {
        return;
      }
      const reference = parseStepOutputReference(value);
      if (reference) {
        references.push({ configurationPath: [...path], reference });
      } else {
        malformed.push({ configurationPath: [...path] });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, [...path, index]));
      return;
    }

    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, [...path, key]);
      }
    }
  }

  walk(configuration, []);

  return { references, malformed };
}
