import { Injectable } from '@nestjs/common';
import type { WorkflowExecutionContext } from '../contracts';
import { SupabaseClientFactory } from './supabase-client.factory';

/**
 * Builds one fresh `WorkflowExecutionContext` per future workflow run.
 * Delegates client construction to `SupabaseClientFactory` — never
 * constructs a `SupabaseClient` itself — so every context created here
 * gets its own isolated client with no shared auth state.
 *
 * Performs no database access and accepts no controller DTOs: the
 * future workflow engine is responsible for loading the project and
 * passing plain, already-validated values in. Does not retain the
 * `publishableKey` beyond the single client-construction call, and never
 * accepts or stores a `signin` password — that value lives only in the
 * `signin` step's own configuration, passed directly to the executor by
 * the future workflow engine.
 */
@Injectable()
export class WorkflowExecutionContextFactory {
  constructor(private readonly supabaseClientFactory: SupabaseClientFactory) {}

  create(input: {
    projectId: string;
    workflowId: string;
    supabaseUrl: string;
    publishableKey: string;
  }): WorkflowExecutionContext {
    return {
      project: { id: input.projectId, supabaseUrl: input.supabaseUrl },
      workflow: { id: input.workflowId },
      supabase: this.supabaseClientFactory.create({
        supabaseUrl: input.supabaseUrl,
        publishableKey: input.publishableKey,
      }),
    };
  }
}
