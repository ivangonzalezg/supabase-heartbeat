import { describe, expect, it } from 'vitest';
import { invokeFunctionConfigurationSchema } from './invoke-function.schema.js';

describe('invokeFunctionConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({
        functionName: 'heartbeat',
        body: {},
      }).success,
    ).toBe(true);
  });

  it('accepts a missing body', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({
        functionName: 'heartbeat',
      }).success,
    ).toBe(true);
  });

  it('accepts a populated JSON body', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({
        functionName: 'heartbeat',
        body: { source: 'workflow', count: 3, nested: { ok: true } },
      }).success,
    ).toBe(true);
  });

  it('rejects a missing functionName', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({ body: {} }).success,
    ).toBe(false);
  });

  it('rejects an empty functionName', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({ functionName: '' })
        .success,
    ).toBe(false);
  });

  it('rejects a wrong type for functionName', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({ functionName: 123 })
        .success,
    ).toBe(false);
  });

  it('rejects a non-JSON body', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({
        functionName: 'heartbeat',
        body: { fn: () => 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(
      invokeFunctionConfigurationSchema.safeParse({
        functionName: 'heartbeat',
        headers: { Authorization: 'Bearer x' },
      }).success,
    ).toBe(false);
  });
});
