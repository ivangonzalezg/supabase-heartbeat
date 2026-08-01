import { describe, expect, it, jest } from '@jest/globals';
import type { UpdateConfiguration } from '@supabase-heartbeat/validation';
import {
  applyPostgrestFilter,
  type FilterableQuery,
} from './apply-postgrest-filter';
import { UnsupportedPersistedFilterOperatorError } from './unsupported-filter-operator.error';

type ValidatedFilter = UpdateConfiguration['filter'];

const stepIdentity = {
  stepId: 'step-1',
  stepKey: 'a',
  stepType: 'update' as const,
};

/**
 * A narrowly typed test double matching only `FilterableQuery`'s own
 * `.eq()` method — not the real PostgREST builder — so these tests stay
 * focused on the translator's own dispatch behavior rather than on SDK
 * internals (already covered by the executor-level tests and the real
 * `tsc` probe documented in `inspection.md`).
 */
interface FakeQuery extends FilterableQuery<FakeQuery> {
  eq(column: string, value: unknown): FakeQuery;
}

function buildFakeQuery() {
  const calls: { method: string; column: string; value: unknown }[] = [];
  const query: FakeQuery = {
    eq: jest.fn((column: string, value: unknown): FakeQuery => {
      calls.push({ method: 'eq', column, value });
      return query;
    }),
  };
  return { query, calls };
}

describe('applyPostgrestFilter', () => {
  it('calls .eq() with the exact column and value for the eq operator', () => {
    const { query, calls } = buildFakeQuery();
    const filter: ValidatedFilter = {
      column: 'id',
      operator: 'eq',
      value: '42',
    };

    const result = applyPostgrestFilter(query, filter, stepIdentity);

    expect(calls).toEqual([{ method: 'eq', column: 'id', value: '42' }]);
    expect(result).toBe(query);
  });

  it('calls no other filter method for the eq operator', () => {
    const methodCalls: string[] = [];
    interface FakeQueryWithExtraMethods extends FilterableQuery<FakeQueryWithExtraMethods> {
      eq(column: string, value: unknown): FakeQueryWithExtraMethods;
      neq(column: string, value: unknown): FakeQueryWithExtraMethods;
      gt(column: string, value: unknown): FakeQueryWithExtraMethods;
    }
    const query: FakeQueryWithExtraMethods = {
      eq: () => {
        methodCalls.push('eq');
        return query;
      },
      neq: () => {
        methodCalls.push('neq');
        return query;
      },
      gt: () => {
        methodCalls.push('gt');
        return query;
      },
    };
    const filter: ValidatedFilter = { column: 'id', operator: 'eq', value: 1 };

    applyPostgrestFilter(query, filter, stepIdentity);

    expect(methodCalls).toEqual(['eq']);
  });

  it('passes a null filter value through unchanged', () => {
    const { query, calls } = buildFakeQuery();
    const filter: ValidatedFilter = {
      column: 'deleted_at',
      operator: 'eq',
      value: null,
    };

    applyPostgrestFilter(query, filter, stepIdentity);

    expect(calls).toEqual([
      { method: 'eq', column: 'deleted_at', value: null },
    ]);
  });

  it('does not mutate the filter input', () => {
    const { query } = buildFakeQuery();
    const filter: ValidatedFilter = {
      column: 'id',
      operator: 'eq',
      value: '42',
    };
    const clone = { ...filter };

    applyPostgrestFilter(query, filter, stepIdentity);

    expect(filter).toEqual(clone);
  });

  it('throws UnsupportedPersistedFilterOperatorError for an impossible/legacy operator', () => {
    const { query } = buildFakeQuery();
    const filter = {
      column: 'id',
      operator: 'neq',
      value: '1',
    } as unknown as ValidatedFilter;

    expect(() => applyPostgrestFilter(query, filter, stepIdentity)).toThrow(
      UnsupportedPersistedFilterOperatorError,
    );
  });

  it('never includes the filter value in the unsupported-operator error message', () => {
    const { query } = buildFakeQuery();
    const filter = {
      column: 'id',
      operator: 'neq',
      value: 'super-secret-filter-value',
    } as unknown as ValidatedFilter;

    try {
      applyPostgrestFilter(query, filter, stepIdentity);
      throw new Error('expected applyPostgrestFilter to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedPersistedFilterOperatorError);
      expect((error as Error).message).not.toContain(
        'super-secret-filter-value',
      );
      expect((error as Error).message).not.toContain('neq');
    }
  });

  it('uses no dynamic method lookup — an object without .eq() fails at compile time, not silently at runtime', () => {
    // This is a structural/compile-time guarantee, not something a
    // runtime assertion can directly prove. The test documents the
    // guarantee: `FilterableQuery<Self>` requires a real `.eq` method,
    // so `query[filter.operator](...)` is not expressible without
    // widening the type away from `FilterableQuery` entirely.
    const { query } = buildFakeQuery();
    const filter: ValidatedFilter = { column: 'id', operator: 'eq', value: 1 };

    expect(() =>
      applyPostgrestFilter(query, filter, stepIdentity),
    ).not.toThrow();
  });
});
