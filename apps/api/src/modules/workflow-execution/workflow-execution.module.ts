import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SupabaseClientFactory } from './context/supabase-client.factory';
import { WorkflowExecutionContextFactory } from './context/workflow-execution-context.factory';
import { DELAY } from './delay/delay';
import { RealDelay } from './delay/real-delay';
import { SigninStepExecutor } from './executors/signin-step.executor';
import { SignoutStepExecutor } from './executors/signout-step.executor';
import { WaitStepExecutor } from './executors/wait-step.executor';
import { StepExecutorRegistry } from './registry/step-executor.registry';

/**
 * The workflow-execution foundation: the executor registry, the
 * per-execution Supabase client/context factories, the delay
 * abstraction, and the three implemented executors (`signin`, `signout`,
 * `wait`).
 *
 * Imports `DiscoveryModule` so `StepExecutorRegistry` can use
 * `DiscoveryService`/`Reflector` to find every `@WorkflowStepExecutor`
 * provider during application bootstrap.
 *
 * No controllers: this module has no HTTP surface. Exports only what a
 * future workflow engine will need — the registry (to resolve an
 * executor by step type) and the context factory (to build a run's
 * shared execution context). Concrete executors are not exported; a
 * future workflow engine goes through the registry, not through direct
 * injection of a specific executor class.
 */
@Module({
  imports: [DiscoveryModule],
  providers: [
    StepExecutorRegistry,
    SupabaseClientFactory,
    WorkflowExecutionContextFactory,
    { provide: DELAY, useClass: RealDelay },
    SigninStepExecutor,
    SignoutStepExecutor,
    WaitStepExecutor,
  ],
  exports: [StepExecutorRegistry, WorkflowExecutionContextFactory],
})
export class WorkflowExecutionModule {}
