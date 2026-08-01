import type { WorkflowStepType } from '@supabase-heartbeat/validation';

/**
 * Thrown when a data/function executor produced a value that cannot be
 * safely represented as JSON for persistence in `step_runs.output` (or
 * that violates this task's table-row contract: every row must
 * normalize to a JSON object, never a primitive). The message is built
 * entirely from step identity and a fixed sentence — it never includes
 * the rejected value, a stringified fragment of it, or any detail about
 * why normalization failed beyond the fixed reason category, since the
 * rejected value could itself carry unexpected data returned by
 * Supabase.
 */
export class InvalidStepExecutionOutputError extends Error {
  readonly stepId: string;
  readonly stepKey: string;
  readonly stepType: WorkflowStepType;

  constructor(input: {
    stepId: string;
    stepKey: string;
    stepType: WorkflowStepType;
    reason: 'not-json-safe' | 'row-not-an-object';
    cause?: unknown;
  }) {
    const reasonText =
      input.reason === 'row-not-an-object'
        ? 'produced a row that is not a JSON object'
        : 'produced an output that cannot be stored as JSON';
    super(
      `Step "${input.stepKey}" (${input.stepType}) ${reasonText}.`,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = 'InvalidStepExecutionOutputError';
    this.stepId = input.stepId;
    this.stepKey = input.stepKey;
    this.stepType = input.stepType;
  }
}
