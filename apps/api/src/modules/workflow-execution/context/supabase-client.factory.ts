import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

/**
 * `ReturnType<typeof createClient>` rather than the bare `SupabaseClient`
 * type: `createClient`'s own generic defaults do not structurally match
 * `SupabaseClient`'s default generics exactly in the installed SDK
 * version, so annotating with `SupabaseClient` directly produces an
 * unsafe-return lint error. Deriving the type from `createClient` itself
 * keeps this factory as the single source of truth for the client type
 * used throughout this module.
 */
export type WorkflowSupabaseClient = ReturnType<typeof createClient>;

/**
 * Constructs a Supabase client configured for backend workflow execution
 * rather than browser persistence:
 *
 * - `persistSession: false` — this is a server process; a client built
 *   here must never read from or write to a shared local-storage-backed
 *   session store.
 * - `autoRefreshToken: false` — a workflow execution is expected to be
 *   short-lived. A background refresh timer has no benefit for a client
 *   this factory creates fresh and discards after one run, and is exactly
 *   the kind of lingering timer that must not survive past execution.
 * - `detectSessionInUrl: false` — irrelevant server-side (there is no
 *   browser URL to inspect); disabling it avoids the SDK doing
 *   unnecessary work.
 *
 * Uses the project's publishable key only — never a service-role key.
 * Never caches or reuses a client: a fresh instance is returned on every
 * call, so no two workflow executions (and no two steps across different
 * contexts) ever share auth state.
 */
@Injectable()
export class SupabaseClientFactory {
  create(input: {
    supabaseUrl: string;
    publishableKey: string;
  }): WorkflowSupabaseClient {
    return createClient(input.supabaseUrl, input.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
}
