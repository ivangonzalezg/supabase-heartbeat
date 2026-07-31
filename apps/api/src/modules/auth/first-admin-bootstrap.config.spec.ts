import {
  readFirstAdminBootstrapConfig,
  FirstAdminBootstrapConfigError,
} from './first-admin-bootstrap.config';

const passwordLengthBounds = { minPasswordLength: 8, maxPasswordLength: 128 };

describe('readFirstAdminBootstrapConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns not-configured when neither email nor password is set', () => {
    delete process.env.FIRST_ADMIN_EMAIL;
    delete process.env.FIRST_ADMIN_PASSWORD;

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(false);
  });

  it('returns not-configured when only FIRST_ADMIN_NAME is set', () => {
    delete process.env.FIRST_ADMIN_EMAIL;
    delete process.env.FIRST_ADMIN_PASSWORD;
    process.env.FIRST_ADMIN_NAME = 'Root';

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(false);
  });

  it('throws when email is set without a password', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    delete process.env.FIRST_ADMIN_PASSWORD;

    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      FirstAdminBootstrapConfigError,
    );
    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      /FIRST_ADMIN_PASSWORD/,
    );
  });

  it('throws when password is set without an email', () => {
    delete process.env.FIRST_ADMIN_EMAIL;
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      FirstAdminBootstrapConfigError,
    );
    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      /FIRST_ADMIN_EMAIL/,
    );
  });

  it('throws on an invalid email', () => {
    process.env.FIRST_ADMIN_EMAIL = 'not-an-email';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      FirstAdminBootstrapConfigError,
    );
  });

  it('trims and lowercases the email', () => {
    process.env.FIRST_ADMIN_EMAIL = '  Admin@Example.com  ';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.email).toBe('admin@example.com');
    }
  });

  it('throws when the password is shorter than the configured minimum', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'short';

    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      FirstAdminBootstrapConfigError,
    );
  });

  it('throws when the password is longer than the configured maximum', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'a'.repeat(129);

    expect(() => readFirstAdminBootstrapConfig(passwordLengthBounds)).toThrow(
      FirstAdminBootstrapConfigError,
    );
  });

  it('does not trim the password', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = '  test-only-password-123  ';

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.password).toBe('  test-only-password-123  ');
    }
  });

  it('defaults the name to Admin when unset', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    delete process.env.FIRST_ADMIN_NAME;

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.name).toBe('Admin');
    }
  });

  it('falls back to Admin when the name is blank after trimming', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    process.env.FIRST_ADMIN_NAME = '   ';

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.name).toBe('Admin');
    }
  });

  it('trims a provided name', () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    process.env.FIRST_ADMIN_NAME = '  Root Admin  ';

    const result = readFirstAdminBootstrapConfig(passwordLengthBounds);

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.name).toBe('Root Admin');
    }
  });
});
