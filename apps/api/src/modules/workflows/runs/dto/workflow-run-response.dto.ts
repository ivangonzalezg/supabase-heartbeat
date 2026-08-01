import { ApiProperty } from '@nestjs/swagger';
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
  stepRunStatuses,
  type WorkflowRunStatus,
  type WorkflowRunTriggerType,
  type StepRunStatus,
} from '@supabase-heartbeat/validation';
import type {
  StepRunResponse,
  WorkflowRunDetailResponse,
} from '../workflow-runs.types';

/**
 * Documentation adapter for `StepRunResponse` (`workflow-runs.types.ts`).
 * `implements` the response interface but is never constructed at
 * runtime — `WorkflowRunsService` returns plain objects; this class only
 * gives Swagger something to reference. See `WorkflowStepResponseDto`
 * for the same established pattern.
 *
 * `inputSnapshot` and `output` are intentionally typed loosely
 * (`Record<string, unknown> | null`), not as a `oneOf` keyed by step
 * type: `inputSnapshot` is a *sanitized, resolved* copy of the step's
 * configuration — every step-output reference
 * (`${steps.<step_key>.output.<path>}`) has already been substituted
 * with its actual value from an earlier step's output before this
 * snapshot was built, so its shape can differ from the original
 * persisted `workflow_steps.configuration` in two ways: a resolved
 * reference (a string in the persisted configuration may become a
 * number, object, array, etc. here) and `signin`'s `password` becoming
 * the literal string `"[REDACTED]"` (not a valid
 * `SigninStepConfiguration`). The persisted workflow-step configuration
 * itself is never modified — only this separate snapshot reflects the
 * resolved value. `output` is whatever JSON-safe shape the resolved
 * executor happened to return — a `oneOf` here would overstate a
 * guarantee this endpoint doesn't actually make. Both are documented
 * instead through prose and per-executor examples.
 */
export class StepRunResponseDto implements StepRunResponse {
  @ApiProperty({ description: 'The step-run ID.' })
  id!: string;

  @ApiProperty({ description: 'The parent workflow-run ID.' })
  workflowRunId!: string;

  @ApiProperty({
    description: 'The ID of the persisted workflow step that was executed.',
  })
  workflowStepId!: string;

  @ApiProperty({
    description:
      "The step's persisted position at the time of execution (0-based).",
    example: 0,
  })
  position!: number;

  @ApiProperty({
    description: 'The step run status.',
    enum: stepRunStatuses,
    example: 'success',
  })
  status!: StepRunStatus;

  @ApiProperty({
    description:
      'A secret-safe snapshot of the step that was executed: ' +
      '`{ stepKey, type, configuration }`, where `configuration` is the ' +
      "step's configuration with any sensitive field redacted (currently " +
      'only `signin.password`, replaced with the literal string ' +
      '`"[REDACTED]"`). Never the plaintext password. `null` only if the ' +
      'step run could not be created in the first place, which does not ' +
      'occur through the manual-run endpoint.',
    nullable: true,
    example: {
      stepKey: 'authenticate_test_user',
      type: 'signin',
      configuration: {
        email: 'heartbeat-user@example.com',
        password: '[REDACTED]',
      },
    },
  })
  inputSnapshot!: Record<string, unknown> | null;

  @ApiProperty({
    description:
      "The executor's safe output on success, `null` on failure or if " +
      'the step has not finished. Never contains a password, access ' +
      'token, refresh token, or Supabase session — see the ' +
      '`signin`/`signout`/`wait` executors for their exact output shapes.',
    nullable: true,
    example: { waitedSeconds: 5 },
  })
  output!: Record<string, unknown> | null;

  @ApiProperty({
    description:
      'A short, safe error message when `status` is `failed`, `null` ' +
      'otherwise. Never includes the step configuration, a stack trace, ' +
      'or the internal error cause.',
    nullable: true,
    example: null,
  })
  error!: string | null;

  @ApiProperty({
    description: 'When this step started executing.',
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiProperty({
    description: 'When this step finished (successfully or not).',
    nullable: true,
  })
  finishedAt!: Date | null;
}

/**
 * Documentation adapter for `WorkflowRunDetailResponse`
 * (`workflow-runs.types.ts`) — the manual-run endpoint's response shape:
 * the completed workflow run together with its ordered step runs.
 */
export class WorkflowRunResponseDto implements WorkflowRunDetailResponse {
  @ApiProperty({ description: 'The workflow-run ID.' })
  id!: string;

  @ApiProperty({ description: 'The executed workflow ID.' })
  workflowId!: string;

  @ApiProperty({
    description:
      'How this run was triggered. Always `manual` for runs created ' +
      'through this endpoint — scheduled triggering is not implemented.',
    enum: workflowRunTriggerTypes,
    example: 'manual',
  })
  triggerType!: WorkflowRunTriggerType;

  @ApiProperty({
    description:
      'The final run status. `success` means every enabled step ' +
      'completed; `failed` means execution stopped at the first step ' +
      'that could not complete (see the included `stepRuns` for which ' +
      'one, and why).',
    enum: workflowRunStatuses,
    example: 'success',
  })
  status!: WorkflowRunStatus;

  @ApiProperty({ description: 'When execution started.', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({
    description: 'When execution finished (successfully or not).',
    nullable: true,
  })
  finishedAt!: Date | null;

  @ApiProperty({
    description:
      'A short, safe error message when `status` is `failed`, `null` ' +
      'on `success`. Identifies the step that failed without exposing ' +
      'its configuration.',
    nullable: true,
    example: null,
  })
  error!: string | null;

  @ApiProperty({
    description:
      'The ordered step runs actually attempted during this execution, ' +
      'in execution order (ascending persisted position). Only enabled ' +
      'steps are attempted; disabled steps never appear here. If ' +
      'execution stopped early due to a failure, steps after the ' +
      'failed one are absent (they were never attempted). Empty if the ' +
      'workflow had no enabled steps.',
    type: [StepRunResponseDto],
  })
  stepRuns!: StepRunResponseDto[];
}
