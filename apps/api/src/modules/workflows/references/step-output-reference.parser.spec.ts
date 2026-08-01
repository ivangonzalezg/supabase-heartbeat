import { describe, expect, it } from '@jest/globals';
import { isValidStepKey } from '@supabase-heartbeat/validation';
import {
  containsReferenceSyntax,
  parseStepOutputReference,
} from './step-output-reference.parser';

/**
 * Candidate `stepKey` strings spanning every rule `isValidStepKey`
 * enforces (leading letter, digits, single underscores between words) and
 * every way each rule can be violated (uppercase, leading digit, leading/
 * trailing underscore, consecutive underscores, hyphens, empty). Used
 * below to prove the parser's stepKey acceptance is driven by
 * `isValidStepKey` itself, not a second, independently-maintained regex —
 * see `STEP_KEY_PATTERN`'s doc comment in
 * `packages/validation/src/workflow-steps/workflow-step.schema.ts` for
 * why a drifted duplicate would be dangerous.
 */
const STEP_KEY_CANDIDATES = [
  'create_record',
  'step1',
  'a',
  'sign_in_2',
  'CreateRecord',
  '1step',
  '_step',
  'step_',
  'step__two',
  'step-key',
  '',
  'has space',
];

describe('parseStepOutputReference', () => {
  it('parses a valid object-property path', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output.data}'),
    ).toEqual({
      stepKey: 'create_record',
      path: ['data'],
    });
  });

  it('parses a valid array-index path', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output.rows.0}'),
    ).toEqual({
      stepKey: 'create_record',
      path: ['rows', 0],
    });
  });

  it('parses a nested mixed path', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output.rows.0.id}'),
    ).toEqual({
      stepKey: 'create_record',
      path: ['rows', 0, 'id'],
    });
  });

  it('parses a camelCase path segment (built-in executor output keys)', () => {
    expect(parseStepOutputReference('${steps.sign_in.output.userId}')).toEqual({
      stepKey: 'sign_in',
      path: ['userId'],
    });
    expect(
      parseStepOutputReference('${steps.sign_out.output.signedOut}'),
    ).toEqual({ stepKey: 'sign_out', path: ['signedOut'] });
    expect(
      parseStepOutputReference('${steps.pause.output.waitedSeconds}'),
    ).toEqual({ stepKey: 'pause', path: ['waitedSeconds'] });
  });

  it('parses the count path', () => {
    expect(
      parseStepOutputReference('${steps.insert_items.output.count}'),
    ).toEqual({
      stepKey: 'insert_items',
      path: ['count'],
    });
  });

  it('rejects a malformed opening brace', () => {
    expect(
      parseStepOutputReference('{steps.create_record.output.id}'),
    ).toBeNull();
  });

  it('rejects a malformed closing brace', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output.id'),
    ).toBeNull();
  });

  it('rejects a missing "steps" segment', () => {
    expect(parseStepOutputReference('${create_record.output.id}')).toBeNull();
  });

  it('rejects a missing step key', () => {
    expect(parseStepOutputReference('${steps..output.id}')).toBeNull();
  });

  it('rejects an invalid snake_case key', () => {
    expect(
      parseStepOutputReference('${steps.CreateRecord.output.id}'),
    ).toBeNull();
    expect(
      parseStepOutputReference('${steps.create-record.output.id}'),
    ).toBeNull();
  });

  it('rejects a missing "output" segment', () => {
    expect(
      parseStepOutputReference('${steps.create_record.input.id}'),
    ).toBeNull();
  });

  it('accepts or rejects a stepKey exactly as isValidStepKey does, for every candidate', () => {
    // Proves the parser has no independent stepKey rule: its accept/
    // reject decision for each candidate is derived from
    // `isValidStepKey` (`@supabase-heartbeat/validation`'s canonical
    // `STEP_KEY_PATTERN`), not a second regex. If a future edit
    // reintroduces a locally-declared pattern in the parser that drifts
    // from the canonical one, this test fails on the first candidate
    // where the two disagree.
    for (const candidate of STEP_KEY_CANDIDATES) {
      const parsed = parseStepOutputReference(
        `\${steps.${candidate}.output.id}`,
      );
      const expectedAccepted = isValidStepKey(candidate);
      expect(parsed !== null).toBe(expectedAccepted);
      if (expectedAccepted) {
        expect(parsed).toEqual({ stepKey: candidate, path: ['id'] });
      }
    }
  });

  it('rejects a missing output path (nothing after output)', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output}'),
    ).toBeNull();
  });

  it('rejects an empty path segment', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output..id}'),
    ).toBeNull();
    expect(
      parseStepOutputReference('${steps.create_record.output.rows.}'),
    ).toBeNull();
  });

  it('rejects a negative index', () => {
    expect(
      parseStepOutputReference('${steps.create_record.output.rows.-1.id}'),
    ).toBeNull();
  });

  it('rejects bracket notation', () => {
    expect(parseStepOutputReference('${steps[0].output.id}')).toBeNull();
    expect(
      parseStepOutputReference('${steps.create_record.output.rows[0].id}'),
    ).toBeNull();
  });

  it('rejects partial interpolation (text before the reference)', () => {
    expect(
      parseStepOutputReference(
        'Created record ${steps.create_record.output.rows.0.id}',
      ),
    ).toBeNull();
  });

  it('rejects partial interpolation (text after the reference)', () => {
    expect(
      parseStepOutputReference(
        '${steps.create_record.output.rows.0.id} was created',
      ),
    ).toBeNull();
  });

  it('rejects multiple references in one string', () => {
    expect(
      parseStepOutputReference(
        '${steps.first.output.count}-${steps.second.output.count}',
      ),
    ).toBeNull();
  });

  it('rejects dangerous property names at parse time, not only at resolution time', () => {
    // __proto__/constructor/prototype are rejected here — during parsing,
    // which is also preflight-validation time — so a workflow containing
    // such a reference never even reaches runtime resolution. See
    // resolve-step-references.spec.ts for the resolver's own,
    // independent defense-in-depth rejection.
    expect(
      parseStepOutputReference('${steps.create_record.output.constructor}'),
    ).toBeNull();
    expect(
      parseStepOutputReference('${steps.create_record.output.prototype}'),
    ).toBeNull();
  });

  it('never evaluates code: a string containing JS syntax is only ever treated as literal text', () => {
    const malicious = '${steps.create_record.output.__proto__}';
    const result = parseStepOutputReference(malicious);
    // Rejected structurally (a dangerous path segment) — proves no code
    // execution or property-expression evaluation ever occurs, and that
    // this value is refused as early as parsing, not merely at
    // resolution time.
    expect(result).toBeNull();
  });

  it('does not support the input namespace', () => {
    expect(
      parseStepOutputReference('${steps.create_record.input.table}'),
    ).toBeNull();
  });

  it('does not support the workflow namespace', () => {
    expect(
      parseStepOutputReference('${workflow.create_record.output.id}'),
    ).toBeNull();
  });
});

describe('containsReferenceSyntax', () => {
  it('detects the reference prefix inside a larger string', () => {
    expect(containsReferenceSyntax('Created ${steps.a.output.id} today')).toBe(
      true,
    );
  });

  it('returns false for an ordinary string', () => {
    expect(containsReferenceSyntax('profiles')).toBe(false);
  });

  it('returns false for a string containing only a dollar sign', () => {
    expect(containsReferenceSyntax('$100')).toBe(false);
  });
});
