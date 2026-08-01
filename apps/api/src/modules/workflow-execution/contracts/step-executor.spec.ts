import { describe, expect, it } from '@jest/globals';
import type { ConfigurationForStepTypeIsExhaustive } from './step-executor';

/**
 * Purely compile-time proof that `ConfigurationForStepType` has a branch
 * for every canonical `WorkflowStepType` value: if a new step type were
 * added to `workflowStepTypes` without a matching branch, this file
 * would fail to typecheck (see `step-executor.ts`'s own doc comment).
 * The runtime assertion below is trivial by construction — it exists so
 * this file has an actual Jest test, keeping the type-level guarantee
 * inside the same test suite the rest of this module is verified by.
 */
describe('ConfigurationForStepType exhaustiveness', () => {
  it('has a mapped-type branch for every canonical WorkflowStepType', () => {
    type Proof = ConfigurationForStepTypeIsExhaustive extends never
      ? true
      : false;
    const isExhaustive: Proof = true;

    expect(isExhaustive).toBe(true);
  });
});
