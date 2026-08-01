import { SupabaseClientFactory } from './supabase-client.factory';

/**
 * `@supabase/auth-js`'s `GoTrueClient` stores its resolved `auth` options
 * (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`) directly
 * as instance properties — confirmed by reading
 * `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` (see
 * `.agent-reports/2026-07-31-step-executor-foundation/inspection.md`).
 * These are not part of the public `.d.ts` surface, so this narrow
 * interface exists only to read them back in tests, verifying the real
 * options the factory actually applied rather than mocking the SDK's own
 * `createClient` boundary — which is not mockable under this project's
 * ESM Jest configuration (`@supabase/supabase-js`'s module namespace is
 * frozen; `jest.spyOn`/`jest.mock` cannot replace its named export).
 */
interface ResolvedGoTrueAuthOptions {
  persistSession: boolean;
  autoRefreshToken: boolean;
  detectSessionInUrl: boolean;
}

function readResolvedAuthOptions(
  client: ReturnType<SupabaseClientFactory['create']>,
): ResolvedGoTrueAuthOptions {
  return client.auth as unknown as ResolvedGoTrueAuthOptions;
}

/** `supabaseUrl`/`supabaseKey` are `protected` in the SDK's `.d.ts` (a
 * TypeScript-only restriction — both are plain enumerable instance
 * properties at runtime), so this cast reads them back for assertions. */
function readUrlAndKey(client: ReturnType<SupabaseClientFactory['create']>): {
  supabaseUrl: string;
  supabaseKey: string;
} {
  return client as unknown as { supabaseUrl: string; supabaseKey: string };
}

describe('SupabaseClientFactory', () => {
  let factory: SupabaseClientFactory;

  beforeEach(() => {
    factory = new SupabaseClientFactory();
  });

  it('creates a fresh client on every call', () => {
    const first = factory.create({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
    const second = factory.create({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });

    expect(first).not.toBe(second);
  });

  it('uses the supplied URL and publishable key', () => {
    const client = factory.create({
      supabaseUrl: 'https://project-ref.supabase.co',
      publishableKey: 'sb_publishable_specific_key',
    });

    const { supabaseUrl, supabaseKey } = readUrlAndKey(client);
    expect(supabaseUrl).toBe('https://project-ref.supabase.co');
    expect(supabaseKey).toBe('sb_publishable_specific_key');
  });

  it('applies the intended backend auth options', () => {
    const client = factory.create({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });

    const resolved = readResolvedAuthOptions(client);
    expect(resolved.persistSession).toBe(false);
    expect(resolved.autoRefreshToken).toBe(false);
    expect(resolved.detectSessionInUrl).toBe(false);
  });

  it('does not cache clients across distinct construction inputs', () => {
    const clientA = factory.create({
      supabaseUrl: 'https://project-a.supabase.co',
      publishableKey: 'sb_publishable_a',
    });
    const clientB = factory.create({
      supabaseUrl: 'https://project-b.supabase.co',
      publishableKey: 'sb_publishable_b',
    });

    expect(clientA).not.toBe(clientB);
  });

  it('does not expose the publishable key as a directly enumerable client property', () => {
    const key = 'sb_publishable_should_not_leak';
    const client = factory.create({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: key,
    });

    // The SDK itself stores the key internally (as `supabaseKey`, needed
    // to authenticate requests) — this asserts the factory adds no
    // *additional* exposure beyond what the SDK already does, e.g. no
    // extra top-level property or log-friendly summary carrying the key.
    const ownKeys = Object.keys(client);
    const suspiciousKeys = ownKeys.filter((prop) => {
      const value = (client as unknown as Record<string, unknown>)[prop];
      return (
        typeof value === 'string' && value === key && prop !== 'supabaseKey'
      );
    });
    expect(suspiciousKeys).toEqual([]);
  });

  it('returns a client exposing the expected auth surface', () => {
    const client = factory.create({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });

    expect(typeof client.auth.signInWithPassword).toBe('function');
    expect(typeof client.auth.signOut).toBe('function');
  });

  it('rejects clearly when supabaseUrl is not a valid URL (the SDK itself validates this)', () => {
    expect(() =>
      factory.create({
        supabaseUrl: 'not-a-valid-url',
        publishableKey: 'sb_publishable_example',
      }),
    ).toThrow(/valid HTTP or HTTPS URL/);
  });

  it('rejects clearly when supabaseUrl is empty (the SDK itself validates this)', () => {
    expect(() =>
      factory.create({
        supabaseUrl: '',
        publishableKey: 'sb_publishable_example',
      }),
    ).toThrow(/supabaseUrl is required/);
  });
});
