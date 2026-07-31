import { describe, expect, it } from 'vitest';
import { insertConfigurationSchema } from './insert.schema.js';

describe('insertConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { source: 'supabase-heartbeat' },
      }).success,
    ).toBe(true);
  });

  it('accepts nested JSON values', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { metadata: { nested: true }, tags: ['a', 'b'] },
      }).success,
    ).toBe(true);
  });

  it('rejects a missing table', () => {
    expect(
      insertConfigurationSchema.safeParse({ values: { a: 1 } }).success,
    ).toBe(false);
  });

  it('rejects an empty table', () => {
    expect(
      insertConfigurationSchema.safeParse({ table: '', values: { a: 1 } })
        .success,
    ).toBe(false);
  });

  it('rejects a missing values object', () => {
    expect(
      insertConfigurationSchema.safeParse({ table: 'heartbeat_events' })
        .success,
    ).toBe(false);
  });

  it('rejects an empty values object', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: {},
      }).success,
    ).toBe(false);
  });

  it('rejects values as an array', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: [1, 2, 3],
      }).success,
    ).toBe(false);
  });

  it('rejects a wrong type for table', () => {
    expect(
      insertConfigurationSchema.safeParse({ table: 123, values: { a: 1 } })
        .success,
    ).toBe(false);
  });

  it('rejects a non-JSON value inside values', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { fn: () => 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(
      insertConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
        extra: true,
      }).success,
    ).toBe(false);
  });
});
