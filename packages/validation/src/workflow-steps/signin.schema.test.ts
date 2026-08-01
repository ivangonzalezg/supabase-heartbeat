import { describe, expect, it } from 'vitest';
import {
  SIGNIN_PASSWORD_MAX_LENGTH,
  signinConfigurationSchema,
} from './signin.schema.js';

describe('signinConfigurationSchema', () => {
  it('accepts a valid email/password configuration', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: 'test-password',
    });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from email', () => {
    const result = signinConfigurationSchema.safeParse({
      email: '  heartbeat-user@example.com  ',
      password: 'test-password',
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('heartbeat-user@example.com');
  });

  it('preserves whitespace in password exactly as submitted', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: '  leading and trailing spaces  ',
    });
    expect(result.success).toBe(true);
    expect(result.data?.password).toBe('  leading and trailing spaces  ');
  });

  it('rejects a missing email', () => {
    const result = signinConfigurationSchema.safeParse({
      password: 'test-password',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty email', () => {
    const result = signinConfigurationSchema.safeParse({
      email: '',
      password: 'test-password',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only email', () => {
    const result = signinConfigurationSchema.safeParse({
      email: '   ',
      password: 'test-password',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email address', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'not-an-email',
      password: 'test-password',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a password at the maximum length', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: 'a'.repeat(SIGNIN_PASSWORD_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password exceeding the maximum length', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: 'a'.repeat(SIGNIN_PASSWORD_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown additional property', () => {
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: 'test-password',
      username: 'unexpected',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object (the previous accepted shape)', () => {
    expect(signinConfigurationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(signinConfigurationSchema.safeParse('not an object').success).toBe(
      false,
    );
    expect(signinConfigurationSchema.safeParse(null).success).toBe(false);
    expect(signinConfigurationSchema.safeParse([]).success).toBe(false);
  });

  it('does not report the submitted password value in issue messages', () => {
    const secret = 'super-secret-value-should-not-leak';
    const result = signinConfigurationSchema.safeParse({
      email: 'heartbeat-user@example.com',
      password: 'a'.repeat(SIGNIN_PASSWORD_MAX_LENGTH + 1).concat(secret),
    });
    expect(result.success).toBe(false);
    const serializedIssues = JSON.stringify(result.error?.issues ?? []);
    expect(serializedIssues).not.toContain(secret);
  });
});
