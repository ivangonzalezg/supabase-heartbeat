import { describe, expect, it } from 'vitest';
import { WAIT_SECONDS_MAX, waitConfigurationSchema } from './wait.schema.js';

describe('waitConfigurationSchema', () => {
  it('accepts a representative valid configuration', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: 10 }).success).toBe(
      true,
    );
  });

  it('accepts the minimum value (1)', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: 1 }).success).toBe(
      true,
    );
  });

  it('accepts the maximum value', () => {
    expect(
      waitConfigurationSchema.safeParse({ seconds: WAIT_SECONDS_MAX }).success,
    ).toBe(true);
  });

  it('rejects zero', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: 0 }).success).toBe(
      false,
    );
  });

  it('rejects a negative value', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: -1 }).success).toBe(
      false,
    );
  });

  it('rejects a value above the maximum', () => {
    expect(
      waitConfigurationSchema.safeParse({ seconds: WAIT_SECONDS_MAX + 1 })
        .success,
    ).toBe(false);
  });

  it('rejects a non-integer value', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects missing seconds', () => {
    expect(waitConfigurationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a wrong type for seconds', () => {
    expect(waitConfigurationSchema.safeParse({ seconds: '10' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown property', () => {
    expect(
      waitConfigurationSchema.safeParse({ seconds: 10, table: 'profiles' })
        .success,
    ).toBe(false);
  });
});
