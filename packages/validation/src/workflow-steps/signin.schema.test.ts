import { describe, expect, it } from 'vitest';
import { signinConfigurationSchema } from './signin.schema.js';

describe('signinConfigurationSchema', () => {
  it('accepts an empty object', () => {
    expect(signinConfigurationSchema.safeParse({}).success).toBe(true);
  });

  it('rejects any additional property', () => {
    expect(
      signinConfigurationSchema.safeParse({ email: 'a@example.com' }).success,
    ).toBe(false);
    expect(
      signinConfigurationSchema.safeParse({ password: 'secret' }).success,
    ).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(signinConfigurationSchema.safeParse('not an object').success).toBe(
      false,
    );
    expect(signinConfigurationSchema.safeParse(null).success).toBe(false);
    expect(signinConfigurationSchema.safeParse([]).success).toBe(false);
  });
});
