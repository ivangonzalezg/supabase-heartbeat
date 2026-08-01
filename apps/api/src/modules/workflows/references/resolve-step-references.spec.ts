import { describe, expect, it } from '@jest/globals';
import type { JsonValue } from '@supabase-heartbeat/validation';
import {
  resolvePath,
  resolveStepReferences,
  type StepOutputStore,
} from './resolve-step-references';
import { StepReferenceResolutionError } from './workflow-reference.errors';

function outputs(entries: Record<string, JsonValue>): StepOutputStore {
  return new Map(Object.entries(entries));
}

describe('resolveStepReferences', () => {
  it('resolves a string value', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.value}',
      outputs({ a: { value: 'hello' } }),
    );
    expect(result).toBe('hello');
  });

  it('resolves a number value, preserving its type', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.count}',
      outputs({ a: { count: 42 } }),
    );
    expect(result).toBe(42);
    expect(typeof result).toBe('number');
  });

  it('resolves a boolean value, preserving its type', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.signedOut}',
      outputs({ a: { signedOut: false } }),
    );
    expect(result).toBe(false);
    expect(typeof result).toBe('boolean');
  });

  it('resolves a null value', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.data}',
      outputs({ a: { data: null } }),
    );
    expect(result).toBeNull();
  });

  it('resolves an object value', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.data}',
      outputs({ a: { data: { id: 'abc' } } }),
    );
    expect(result).toEqual({ id: 'abc' });
  });

  it('resolves an array value', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.rows}',
      outputs({ a: { rows: [{ id: '1' }, { id: '2' }] } }),
    );
    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('resolves a nested object path', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.data.user.id}',
      outputs({ a: { data: { user: { id: 'user-1' } } } }),
    );
    expect(result).toBe('user-1');
  });

  it('resolves an array index', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.rows.1.id}',
      outputs({ a: { rows: [{ id: 'first' }, { id: 'second' }] } }),
    );
    expect(result).toBe('second');
  });

  it('resolves index zero', () => {
    const result = resolveStepReferences(
      'consumer',
      '${steps.a.output.rows.0.id}',
      outputs({ a: { rows: [{ id: 'first' }] } }),
    );
    expect(result).toBe('first');
  });

  it('fails safely for a missing property', () => {
    expect(() =>
      resolveStepReferences(
        'consumer',
        '${steps.a.output.missing}',
        outputs({ a: { rows: [] } }),
      ),
    ).toThrow(StepReferenceResolutionError);
  });

  it('fails safely for a missing array index', () => {
    expect(() =>
      resolveStepReferences(
        'consumer',
        '${steps.a.output.rows.5}',
        outputs({ a: { rows: [{ id: '1' }] } }),
      ),
    ).toThrow(StepReferenceResolutionError);
  });

  it('fails safely when indexing a non-array', () => {
    expect(() =>
      resolveStepReferences(
        'consumer',
        '${steps.a.output.rows.0}',
        outputs({ a: { rows: 'not-an-array' } }),
      ),
    ).toThrow(StepReferenceResolutionError);
  });

  it('fails safely for property access on a primitive', () => {
    expect(() =>
      resolveStepReferences(
        'consumer',
        '${steps.a.output.value.nested}',
        outputs({ a: { value: 'a-string' } }),
      ),
    ).toThrow(StepReferenceResolutionError);
  });

  it('treats a dangerous-segment reference string as a harmless literal, since the parser now rejects it upstream', () => {
    // parseStepOutputReference (see step-output-reference.parser.spec.ts)
    // now rejects __proto__/prototype/constructor path segments at parse
    // time — a preflight-time rejection, not merely a runtime one. This
    // means resolveStepReferences's first call to the parser returns
    // `null` for these strings, so they fall through to the "not a
    // reference" branch and are returned unchanged, exactly like any
    // other non-reference string. They can never reach `resolvePath`
    // through this normal, parser-gated entry point.
    const value = resolveStepReferences(
      'consumer',
      '${steps.a.output.__proto__}',
      outputs({ a: { rows: [] } }),
    );
    expect(value).toBe('${steps.a.output.__proto__}');
  });

  it('resolvePath itself still rejects a dangerous property segment defensively, independent of the parser', () => {
    // Direct, parser-bypassing exercise of the resolver's own
    // defense-in-depth layer: resolvePath must never traverse
    // __proto__/prototype/constructor even when called with a path
    // array that was not produced by parseStepOutputReference (e.g. a
    // future caller, or a refactor that changes how paths are built).
    const onFailure = (): never => {
      throw new StepReferenceResolutionError({
        stepKey: 'consumer',
        referencedStepKey: 'a',
        path: ['__proto__'],
      });
    };
    expect(() => resolvePath({ rows: [] }, ['__proto__'], onFailure)).toThrow(
      StepReferenceResolutionError,
    );
    expect(() => resolvePath({}, ['constructor'], onFailure)).toThrow(
      StepReferenceResolutionError,
    );
    expect(() => resolvePath({}, ['prototype'], onFailure)).toThrow(
      StepReferenceResolutionError,
    );
  });

  it('fails safely when the referenced step has no stored output', () => {
    expect(() =>
      resolveStepReferences(
        'consumer',
        '${steps.missing_step.output.id}',
        outputs({}),
      ),
    ).toThrow(StepReferenceResolutionError);
  });

  it('does not mutate the prior output map', () => {
    const store = outputs({ a: { rows: [{ id: '1' }] } });
    const snapshot = new Map(store);

    resolveStepReferences('consumer', '${steps.a.output.rows.0.id}', store);

    expect(store).toEqual(snapshot);
  });

  it('does not mutate the source configuration', () => {
    const configuration: JsonValue = {
      values: { id: '${steps.a.output.id}' },
    };
    const clone = JSON.parse(JSON.stringify(configuration)) as JsonValue;

    resolveStepReferences(
      'consumer',
      configuration,
      outputs({ a: { id: 'x' } }),
    );

    expect(configuration).toEqual(clone);
  });

  it('returns a fresh configuration value, not the same object reference', () => {
    const configuration: JsonValue = { values: { id: 'literal' } };

    const resolved = resolveStepReferences(
      'consumer',
      configuration,
      outputs({}),
    );

    expect(resolved).not.toBe(configuration);
    expect(resolved).toEqual(configuration);
  });

  it('recursively resolves multiple references within one configuration', () => {
    const configuration: JsonValue = {
      table: 'audit_logs',
      values: {
        recordId: '${steps.create_record.output.rows.0.id}',
        metadata: {
          functionStatus: '${steps.health_check.output.data.status}',
        },
        relatedIds: [
          '${steps.first_insert.output.rows.0.id}',
          '${steps.second_insert.output.rows.0.id}',
        ],
      },
    };
    const store = outputs({
      create_record: { rows: [{ id: 'record-1' }], count: 1 },
      health_check: { data: { status: 'ok' } },
      first_insert: { rows: [{ id: 'first-1' }], count: 1 },
      second_insert: { rows: [{ id: 'second-1' }], count: 1 },
    });

    const resolved = resolveStepReferences('consumer', configuration, store);

    expect(resolved).toEqual({
      table: 'audit_logs',
      values: {
        recordId: 'record-1',
        metadata: { functionStatus: 'ok' },
        relatedIds: ['first-1', 'second-1'],
      },
    });
  });

  it('leaves a non-reference string unchanged', () => {
    const configuration: JsonValue = { table: 'profiles' };

    const resolved = resolveStepReferences(
      'consumer',
      configuration,
      outputs({}),
    );

    expect(resolved).toEqual({ table: 'profiles' });
  });

  it('fails safely for unsupported partial interpolation reaching the resolver', () => {
    // The preflight validator normally rejects this before execution;
    // this proves the resolver itself also does not silently resolve a
    // partial match — it treats an unparseable string as a literal,
    // non-reference value and leaves it unchanged.
    const configuration: JsonValue = {
      message: 'Created ${steps.a.output.id} today',
    };

    const resolved = resolveStepReferences(
      'consumer',
      configuration,
      outputs({ a: { id: 'x' } }),
    );

    expect(resolved).toEqual({ message: 'Created ${steps.a.output.id} today' });
  });
});
