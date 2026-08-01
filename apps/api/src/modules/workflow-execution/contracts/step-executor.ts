import type {
  SigninConfiguration,
  SignoutConfiguration,
  WaitConfiguration,
  WorkflowStepType,
} from '@supabase-heartbeat/validation';
import type { StepExecutionResult } from './step-execution-result';
import type { WorkflowExecutionContext } from './workflow-execution-context';

/**
 * Maps each canonical workflow-step type to its validated configuration
 * type from the shared validation package. Types without an executor yet
 * (`insert`, `read`, `update`, `delete`, `invoke_function`) map to an
 * empty object shape — no executor in this task ever receives one.
 *
 * Defined locally rather than in `@supabase-heartbeat/validation`: that
 * package exports each configuration type individually and has no
 * mapped-type API yet; inventing one there ahead of the other five
 * executors existing would be speculative.
 */
export type ConfigurationForStepType<T extends WorkflowStepType> =
  T extends 'signin'
    ? SigninConfiguration
    : T extends 'signout'
      ? SignoutConfiguration
      : T extends 'wait'
        ? WaitConfiguration
        : Record<string, never>;

/**
 * The minimal, execution-only view of a persisted workflow step. Carries
 * no ownership or HTTP-actor information — the future workflow engine is
 * responsible for loading and normalizing a real database row into this
 * shape before invoking an executor.
 */
export interface ExecutableWorkflowStep<T extends WorkflowStepType> {
  readonly id: string;
  readonly workflowId: string;
  readonly stepKey: string;
  readonly type: T;
  readonly position: number;
  readonly configuration: ConfigurationForStepType<T>;
}

/**
 * One workflow-step implementation. Asynchronous, receives the shared
 * execution context and a normalized executable step, and returns a
 * JSON-safe result. Never touches HTTP concerns, controllers, or
 * `workflow_runs`/`step_runs` persistence — those belong to the future
 * workflow engine, not to an individual executor.
 */
export interface StepExecutor<T extends WorkflowStepType = WorkflowStepType> {
  readonly type: T;

  execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<T>,
  ): Promise<StepExecutionResult>;
}
