import { SetMetadata } from '@nestjs/common';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';

/**
 * Metadata key `StepExecutorRegistry` reads via `Reflector` to discover
 * decorated executor providers. Not exported for external use beyond this
 * module — a `Symbol` (rather than a string) avoids any accidental key
 * collision with metadata set by another NestJS package.
 */
export const WORKFLOW_STEP_EXECUTOR_TYPE = Symbol(
  'WORKFLOW_STEP_EXECUTOR_TYPE',
);

/**
 * Marks a provider class as the executor for one canonical workflow-step
 * type. `StepExecutorRegistry` discovers every provider carrying this
 * metadata during application bootstrap and builds its lookup table from
 * them — no manually maintained switch statement or executor array.
 *
 * Usage:
 * ```ts
 * @WorkflowStepExecutor('signin')
 * @Injectable()
 * export class SigninStepExecutor implements StepExecutor<'signin'> { ... }
 * ```
 */
export const WorkflowStepExecutor = (type: WorkflowStepType) =>
  SetMetadata(WORKFLOW_STEP_EXECUTOR_TYPE, type);
