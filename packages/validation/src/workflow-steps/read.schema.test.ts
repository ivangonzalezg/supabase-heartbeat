import { describe, expect, it } from 'vitest';
import { READ_LIMIT_MAX, readConfigurationSchema } from './read.schema.js';

describe('readConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(
      readConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        columns: '*',
        limit: 1,
      }).success,
    ).toBe(true);
  });

  it('accepts table only, defaulting columns to "*"', () => {
    const result = readConfigurationSchema.safeParse({
      table: 'heartbeat_events',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toBe('*');
    }
  });

  it('preserves an explicit columns value', () => {
    const result = readConfigurationSchema.safeParse({
      table: 'heartbeat_events',
      columns: 'id,created_at',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toBe('id,created_at');
    }
  });

  it('rejects a missing table', () => {
    expect(readConfigurationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty table', () => {
    expect(readConfigurationSchema.safeParse({ table: '' }).success).toBe(
      false,
    );
  });

  it('rejects limit of zero', () => {
    expect(
      readConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        limit: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects a limit above the maximum', () => {
    expect(
      readConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        limit: READ_LIMIT_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(
      readConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        limit: 1.5,
      }).success,
    ).toBe(false);
  });

  it('rejects a wrong type for table', () => {
    expect(readConfigurationSchema.safeParse({ table: 123 }).success).toBe(
      false,
    );
  });

  it('rejects an unknown property', () => {
    expect(
      readConfigurationSchema.safeParse({
        table: 'heartbeat_events',
        filters: {},
      }).success,
    ).toBe(false);
  });
});
