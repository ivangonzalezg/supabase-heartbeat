import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The shared context for one future workflow run. Every step executor
 * invoked within the same run receives the same context instance — and
 * therefore the same Supabase client — so a `signin` step's authenticated
 * session remains visible to every later step in that run.
 *
 * Intentionally does not carry the project's publishable key: nothing
 * beyond `WorkflowExecutionContextFactory` needs it once `supabase` has
 * been constructed, and omitting it removes any risk of the key being
 * logged or serialized incidentally via this object.
 *
 * Intentionally does not carry step-output state yet — output-reference
 * resolution between steps is out of scope for this task and belongs to
 * the future workflow-engine task.
 */
export interface WorkflowExecutionContext {
  readonly project: {
    readonly id: string;
    readonly supabaseUrl: string;
  };
  readonly workflow: {
    readonly id: string;
  };
  readonly supabase: SupabaseClient;
}
