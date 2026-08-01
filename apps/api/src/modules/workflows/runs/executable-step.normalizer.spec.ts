import { describe, expect, it } from '@jest/globals';
import type { WorkflowStep } from '../../../database/schema/types';
import {
  assertPersistedStepConfigurationIsValid,
  InvalidPersistedStepConfigurationError,
  toExecutableWorkflowStep,
} from './executable-step.normalizer';
import { ResolvedStepConfigurationError } from '../references/workflow-reference.errors';

function buildRow(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'update_row',
    type: 'update',
    position: 0,
    configuration: {
      table: 't',
      values: { active: false },
      filter: { column: 'id', operator: 'eq', value: 'row-1' },
    },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('assertPersistedStepConfigurationIsValid', () => {
  it('does not throw for a valid persisted configuration', () => {
    expect(() =>
      assertPersistedStepConfigurationIsValid(buildRow()),
    ).not.toThrow();
  });

  it('throws InvalidPersistedStepConfigurationError for a configuration that no longer matches its type', () => {
    const row = buildRow({
      type: 'wait',
      configuration: { table: 'profiles' },
    });

    expect(() => assertPersistedStepConfigurationIsValid(row)).toThrow(
      InvalidPersistedStepConfigurationError,
    );
  });
});

describe('toExecutableWorkflowStep', () => {
  it('builds an executable step from a valid resolved configuration', () => {
    const row = buildRow();
    const resolved = {
      table: 't',
      values: { active: false },
      filter: { column: 'id', operator: 'eq', value: 'resolved-id' },
    };

    const executable = toExecutableWorkflowStep(row, resolved);

    expect(executable).toEqual({
      id: row.id,
      workflowId: row.workflowId,
      stepKey: row.stepKey,
      type: 'update',
      position: row.position,
      configuration: resolved,
    });
  });

  it('accepts a reference resolving into filter.value (JsonValue-typed field)', () => {
    const row = buildRow();
    const resolved = {
      table: 't',
      values: { active: false },
      filter: { column: 'id', operator: 'eq', value: { nested: 'object' } },
    };

    expect(() => toExecutableWorkflowStep(row, resolved)).not.toThrow();
  });

  it('rejects a resolved configuration where a number replaces a required string', () => {
    const row = buildRow({
      type: 'insert',
      configuration: { table: 't', values: { a: 1 } },
    });
    const resolved = { table: 42, values: { a: 1 } };

    expect(() => toExecutableWorkflowStep(row, resolved)).toThrow(
      ResolvedStepConfigurationError,
    );
  });

  it('rejects a resolved configuration where an object replaces a required scalar', () => {
    const row = buildRow({
      type: 'wait',
      configuration: { seconds: 5 },
    });
    const resolved = { seconds: { nested: true } };

    expect(() => toExecutableWorkflowStep(row, resolved)).toThrow(
      ResolvedStepConfigurationError,
    );
  });

  it('rejects a resolved configuration where null replaces a required string', () => {
    const row = buildRow({
      type: 'invoke_function',
      configuration: { functionName: 'fn' },
    });
    const resolved = { functionName: null };

    expect(() => toExecutableWorkflowStep(row, resolved)).toThrow(
      ResolvedStepConfigurationError,
    );
  });

  it('accepts a reference resolving into a nested insert.values field', () => {
    const row = buildRow({
      type: 'insert',
      configuration: { table: 't', values: { recordId: 'x' } },
    });
    const resolved = { table: 't', values: { recordId: 'resolved-value' } };

    expect(() => toExecutableWorkflowStep(row, resolved)).not.toThrow();
  });

  it('accepts a reference resolving into invoke_function.body', () => {
    const row = buildRow({
      type: 'invoke_function',
      configuration: { functionName: 'fn', body: { userId: 'x' } },
    });
    const resolved = { functionName: 'fn', body: { userId: 'resolved-id' } };

    expect(() => toExecutableWorkflowStep(row, resolved)).not.toThrow();
  });

  it('never includes the resolved value in the thrown error message', () => {
    const row = buildRow({
      type: 'insert',
      configuration: { table: 't', values: { a: 1 } },
    });
    const resolved = {
      table: 'super-secret-resolved-value',
      values: 'not-an-object',
    };

    try {
      toExecutableWorkflowStep(row, resolved);
      throw new Error('expected toExecutableWorkflowStep to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ResolvedStepConfigurationError);
      expect((error as Error).message).not.toContain(
        'super-secret-resolved-value',
      );
    }
  });
});
