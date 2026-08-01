import type {
  SigninConfiguration,
  SignoutConfiguration,
  WaitConfiguration,
  InsertConfiguration,
  ReadConfiguration,
  UpdateConfiguration,
  DeleteConfiguration,
  InvokeFunctionConfiguration,
  WorkflowStepType,
} from '@supabase-heartbeat/validation';
import type { StepExecutionResult } from './step-execution-result';
import type { WorkflowExecutionContext } from './workflow-execution-context';

/**
 * Maps each canonical workflow-step type to its validated configuration
 * type from the shared validation package. Every one of the 8 current
 * MVP types (`signin`, `signout`, `wait`, `insert`, `read`, `update`,
 * `delete`, `invoke_function`) now has a registered executor and a
 * corresponding branch here — no broad fallback remains for an
 * implemented canonical type.
 *
 * Defined locally rather than in `@supabase-heartbeat/validation`: that
 * package exports each configuration type individually and has no
 * mapped-type API of its own; a mapped type is an execution-layer
 * concern, not a validation concern.
 */
export type ConfigurationForStepType<T extends WorkflowStepType> =
  T extends 'signin'
    ? SigninConfiguration
    : T extends 'signout'
      ? SignoutConfiguration
      : T extends 'wait'
        ? WaitConfiguration
        : T extends 'insert'
          ? InsertConfiguration
          : T extends 'read'
            ? ReadConfiguration
            : T extends 'update'
              ? UpdateConfiguration
              : T extends 'delete'
                ? DeleteConfiguration
                : T extends 'invoke_function'
                  ? InvokeFunctionConfiguration
                  : never;

/**
 * Compile-time exhaustiveness check: if `WorkflowStepType` ever gains a
 * new canonical value without a corresponding branch above,
 * `ConfigurationForStepType<NewType>` resolves to `never`, which makes
 * this mapped type resolve to a non-`never` union containing that type's
 * literal name — failing the `AssertExhaustive<never>` constraint below
 * and breaking the build until a new branch is added. Exported (not
 * merely declared) so ESLint's `no-unused-vars` treats its declaration
 * as used and so a unit test can assert its own type resolves to
 * `never` today (see `step-executor.spec.ts`).
 */
type AssertExhaustive<T extends never> = T;
export type ConfigurationForStepTypeIsExhaustive = AssertExhaustive<
  {
    [K in WorkflowStepType]: ConfigurationForStepType<K> extends never
      ? K
      : never;
  }[WorkflowStepType]
>;

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
