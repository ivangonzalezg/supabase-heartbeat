import { isValidStepKey } from '@supabase-heartbeat/validation';

/**
 * A parsed, structural view of one `${steps.<step_key>.output.<path>}`
 * reference string. `path` segments are either object-property names
 * (strings) or zero-based array indices (numbers) — never a mix encoded
 * ambiguously, since the parser decides string-vs-number itself from
 * each raw path segment's own shape (see `parseStepOutputReference`).
 */
export interface StepOutputReference {
  readonly stepKey: string;
  readonly path: ReadonlyArray<string | number>;
}

/**
 * Matches one non-empty path segment: either a run of
 * letters/digits/underscores (an object property name — built-in
 * executor outputs use camelCase keys such as `userId`, `signedOut`,
 * `waitedSeconds`, and `insert`/`update`/`delete` row data reflects
 * arbitrary caller-defined column names, so both cases and digits are
 * allowed here even though `stepKey` itself is restricted to snake_case)
 * or a run of digits (an array index). Deliberately simple and
 * non-overlapping with itself (no nested quantifiers, no alternation
 * between overlapping character classes) — this pattern cannot exhibit
 * catastrophic backtracking because each character class is disjoint and
 * the match is anchored per-segment, not evaluated as one large regex
 * across the whole path.
 */
const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Path segments the parser rejects outright, regardless of matching
 * `PATH_SEGMENT_PATTERN` — a reference addressing one of these can never
 * be structurally valid, so it is rejected here (during parsing /
 * preflight) rather than only failing later during runtime resolution.
 * The runtime resolver (`resolve-step-references.ts`) keeps its own
 * independent denylist and `hasOwnProperty` check as defense in depth —
 * this is a second, upstream backstop, not a replacement for that one.
 */
const DANGEROUS_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

const REFERENCE_PATTERN = /^\$\{steps\.([^.}]+)\.output((?:\.[^.}]+)+)\}$/;

/**
 * Parses one candidate string as a whole-value step-output reference.
 * Returns `null` for anything that is not *exactly* one complete
 * `${steps.<step_key>.output.<path>}` reference — including a string
 * that merely contains one as a substring (partial interpolation is
 * explicitly unsupported, see the module-level scope notes in
 * `apps/api/README.md`). Never partially matches, never evaluates code,
 * never uses `eval`/`Function`, and never falls back to a looser shape.
 *
 * The single anchored regex above only isolates the coarse
 * `steps.<raw>.output.<raw path>` shape (rejecting malformed braces,
 * a missing `output` segment, bracket notation like `steps[0]`, and any
 * text before/after the reference in the same string, all in one
 * anchored match with no backtracking hazard since each capture group
 * is a simple "no `.` or `}`" run). The captured `stepKey` is then
 * validated via `isValidStepKey` (`@supabase-heartbeat/validation`'s
 * canonical `STEP_KEY_PATTERN` — the single source of truth for
 * `stepKey` syntax, also used by the shared `stepKeySchema`; this
 * parser never re-declares its own copy of that rule) and each path
 * segment is independently validated by the fixed, linear
 * `PATH_SEGMENT_PATTERN` check and the `DANGEROUS_PATH_SEGMENTS`
 * denylist below — no JavaScript property-expression parsing, no
 * numeric coercion beyond `Number.parseInt` on an already-digits-only
 * string.
 *
 * A path segment matching `__proto__`/`prototype`/`constructor` is
 * rejected here — at parse time, which is also preflight-validation
 * time (see `validate-workflow-references.ts`) — rather than only
 * failing later during runtime resolution. This means a workflow
 * containing such a reference is rejected during creation/update/
 * reorder with a safe structural error, and no `workflow_run` is ever
 * created for it. The runtime resolver keeps its own independent
 * denylist and `hasOwnProperty` check regardless, as defense in depth.
 */
export function parseStepOutputReference(
  value: string,
): StepOutputReference | null {
  const match = REFERENCE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, rawStepKey, rawPath] = match;
  if (!isValidStepKey(rawStepKey)) {
    return null;
  }

  // `rawPath` is `.segment1.segment2...` (the leading `.output` was
  // already consumed by the outer match) — split on `.` and drop the
  // leading empty string produced by the leading dot.
  const rawSegments = rawPath.split('.').slice(1);

  const path: Array<string | number> = [];
  for (const segment of rawSegments) {
    if (segment.length === 0) {
      // Two consecutive dots (`..`) or a trailing dot before `}` — an
      // empty path segment is always invalid.
      return null;
    }
    if (!PATH_SEGMENT_PATTERN.test(segment)) {
      return null;
    }
    if (DANGEROUS_PATH_SEGMENTS.has(segment)) {
      return null;
    }
    if (/^[0-9]+$/.test(segment)) {
      // An all-digit segment is an array index. A segment like `01`
      // (leading zero) is intentionally still accepted as index 1's
      // literal form is not required elsewhere in this codebase — the
      // grammar only needs "digits only", not canonical integer
      // formatting.
      path.push(Number.parseInt(segment, 10));
    } else {
      path.push(segment);
    }
  }

  if (path.length === 0) {
    // `${steps.key.output}` with nothing after `output` — rejected:
    // every reference must address at least one path segment.
    return null;
  }

  return { stepKey: rawStepKey, path };
}

/**
 * True if `value` contains the reference syntax `${steps....}` anywhere
 * — including as part of a larger string — without requiring it to be a
 * complete, whole-value reference. Used to distinguish "not a reference
 * at all" (left untouched) from "partial interpolation" (explicitly
 * rejected during validation) — see
 * `apps/api/src/modules/workflows/references/reference-discovery.ts`.
 * Intentionally loose (matches the literal `${steps.` prefix only, not
 * a fully-anchored reference) so it also flags a *malformed* embedded
 * attempt, e.g. `Created ${steps.bad key}`, rather than only well-formed
 * ones.
 */
export function containsReferenceSyntax(value: string): boolean {
  return value.includes('${steps.');
}
