import { describe, expect, it } from 'vitest';
import { updateConfigurationSchema } from './update.schema.js';

const validFilter = { column: 'id', operator: 'eq' as const, value: 1 };

describe('updateConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { checked_at: '2026-07-31T12:00:00Z' },
        filter: validFilter,
      }).success,
    ).toBe(true);
  });

  it('rejects a missing table', () => {
    expect(
      updateConfigurationSchema.safeParse({
        values: { a: 1 },
        filter: validFilter,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing values object', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        filter: validFilter,
      }).success,
    ).toBe(false);
  });

  it('rejects an empty values object', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: {},
        filter: validFilter,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing filter', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported filter operator', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
        filter: { column: 'id', operator: 'gt', value: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a filter missing column', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
        filter: { operator: 'eq', value: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-JSON value inside values', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { fn: () => 'x' },
        filter: validFilter,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
        filter: validFilter,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown property inside filter', () => {
    expect(
      updateConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        values: { a: 1 },
        filter: { ...validFilter, extra: true },
      }).success,
    ).toBe(false);
  });
});
