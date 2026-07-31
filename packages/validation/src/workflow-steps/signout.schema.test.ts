import { describe, expect, it } from 'vitest';
import { signoutConfigurationSchema } from './signout.schema.js';

describe('signoutConfigurationSchema', () => {
  it('accepts an empty object', () => {
    expect(signoutConfigurationSchema.safeParse({}).success).toBe(true);
  });

  it('rejects any additional property', () => {
    expect(
      signoutConfigurationSchema.safeParse({ redirect: '/login' }).success,
    ).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(signoutConfigurationSchema.safeParse('nope').success).toBe(false);
    expect(signoutConfigurationSchema.safeParse(null).success).toBe(false);
  });
});
