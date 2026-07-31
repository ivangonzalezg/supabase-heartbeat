import { describe, expect, it } from 'vitest';
import { deleteConfigurationSchema } from './delete.schema.js';

const validFilter = { column: 'id', operator: 'eq' as const, value: 1 };

describe('deleteConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(
      deleteConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        filter: validFilter,
      }).success,
    ).toBe(true);
  });

  it('rejects a missing table', () => {
    expect(
      deleteConfigurationSchema.safeParse({ filter: validFilter }).success,
    ).toBe(false);
  });

  it('rejects a missing filter (never allow an unfiltered delete)', () => {
    expect(
      deleteConfigurationSchema.safeParse({ table: 'heartbeat_events' })
        .success,
    ).toBe(false);
  });

  it('rejects an empty configuration entirely', () => {
    expect(deleteConfigurationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unsupported filter operator', () => {
    expect(
      deleteConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        filter: { column: 'id', operator: 'neq', value: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(
      deleteConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        filter: validFilter,
        cascade: true,
      }).success,
    ).toBe(false);
  });
});
