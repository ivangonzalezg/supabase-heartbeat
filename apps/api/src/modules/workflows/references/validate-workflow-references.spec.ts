import { describe, expect, it } from '@jest/globals';
import {
  validateWorkflowReferences,
  type WorkflowStepReferenceInput,
} from './validate-workflow-references';
import {
  DisabledStepReferenceError,
  ForwardStepReferenceError,
  InvalidStepReferenceSyntaxError,
  ReferencedStepNotFoundError,
} from './workflow-reference.errors';

function step(
  overrides: Partial<WorkflowStepReferenceInput>,
): WorkflowStepReferenceInput {
  return {
    stepKey: 'a',
    enabled: true,
    configuration: {},
    ...overrides,
  };
}

describe('validateWorkflowReferences', () => {
  it('accepts a valid earlier-step reference', () => {
    const steps = [
      step({ stepKey: 'create_record', configuration: { table: 't' } }),
      step({
        stepKey: 'delete_record',
        configuration: { value: '${steps.create_record.output.rows.0.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('rejects a reference to an unknown step', () => {
    const steps = [
      step({
        stepKey: 'delete_record',
        configuration: { value: '${steps.create_row.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      ReferencedStepNotFoundError,
    );
  });

  it('rejects a reference to a later step', () => {
    const steps = [
      step({
        stepKey: 'delete_record',
        configuration: { value: '${steps.create_record.output.id}' },
      }),
      step({ stepKey: 'create_record' }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      ForwardStepReferenceError,
    );
  });

  it('rejects a self-reference', () => {
    const steps = [
      step({
        stepKey: 'a',
        configuration: { value: '${steps.a.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      ForwardStepReferenceError,
    );
  });

  it('rejects a reference to a disabled step', () => {
    const steps = [
      step({ stepKey: 'create_record', enabled: false }),
      step({
        stepKey: 'delete_record',
        configuration: { value: '${steps.create_record.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      DisabledStepReferenceError,
    );
  });

  it('ignores a malformed reference inside a disabled consumer', () => {
    const steps = [
      step({ stepKey: 'create_record' }),
      step({
        stepKey: 'broken_consumer',
        enabled: false,
        configuration: {
          value: 'Created ${steps.create_record.output.id} today',
        },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('rejects duplicate step keys when the second occurrence self-references', () => {
    // Duplicate keys are normally rejected earlier (DTO / DB uniqueness
    // constraint) before this validator ever runs; this proves the
    // validator itself does not silently resolve a duplicate key to a
    // "safe" one — the *last* matching index wins for lookup purposes,
    // so a step sharing its key with a later duplicate of itself is
    // treated as a self-reference and rejected, never silently
    // resolved.
    const steps = [
      step({ stepKey: 'a' }),
      step({
        stepKey: 'a',
        configuration: { value: '${steps.a.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      ForwardStepReferenceError,
    );
  });

  it('rejects malformed reference syntax', () => {
    const steps = [
      step({
        stepKey: 'a',
        configuration: { value: 'prefix ${steps.b.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      InvalidStepReferenceSyntaxError,
    );
  });

  it('accepts multiple valid dependencies on the same earlier step', () => {
    const steps = [
      step({ stepKey: 'create_record' }),
      step({
        stepKey: 'log_record',
        configuration: { a: '${steps.create_record.output.id}' },
      }),
      step({
        stepKey: 'notify_record',
        configuration: { b: '${steps.create_record.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('accepts a chain of dependencies A -> B -> C', () => {
    const steps = [
      step({ stepKey: 'a' }),
      step({
        stepKey: 'b',
        configuration: { value: '${steps.a.output.id}' },
      }),
      step({
        stepKey: 'c',
        configuration: { value: '${steps.b.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('rejects a reordered chain that turns a valid dependency into a forward reference', () => {
    const validOrder = [
      step({ stepKey: 'a' }),
      step({
        stepKey: 'b',
        configuration: { value: '${steps.a.output.id}' },
      }),
    ];
    expect(() => validateWorkflowReferences(validOrder)).not.toThrow();

    const reordered = [validOrder[1], validOrder[0]];
    expect(() => validateWorkflowReferences(reordered)).toThrow(
      ForwardStepReferenceError,
    );
  });

  it('does not falsely detect a cycle for a valid ordered chain', () => {
    const steps = [
      step({ stepKey: 'a' }),
      step({
        stepKey: 'b',
        configuration: { value: '${steps.a.output.id}' },
      }),
      step({
        stepKey: 'c',
        configuration: { value: '${steps.b.output.id}' },
      }),
      step({
        stepKey: 'd',
        configuration: { value: '${steps.a.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('rejects partial interpolation', () => {
    const steps = [
      step({
        stepKey: 'a',
        configuration: {
          url: '/records/${steps.b.output.id}',
        },
      }),
      step({ stepKey: 'b' }),
    ];

    expect(() => validateWorkflowReferences(steps)).toThrow(
      InvalidStepReferenceSyntaxError,
    );
  });

  it('does not attempt to resolve the reference path at preflight time', () => {
    // A reference to a path that could never plausibly exist on any real
    // executor output is still structurally valid — preflight only
    // checks stepKey/order/enabled state, never the path itself.
    const steps = [
      step({ stepKey: 'create_record' }),
      step({
        stepKey: 'consumer',
        configuration: {
          value: '${steps.create_record.output.this.path.does.not.exist}',
        },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('does nothing for a workflow with no references', () => {
    const steps = [step({ stepKey: 'a' }), step({ stepKey: 'b' })];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });

  it('validates only enabled steps, skipping disabled ones entirely', () => {
    const steps = [
      step({
        stepKey: 'a',
        enabled: false,
        configuration: { value: '${steps.unknown.output.id}' },
      }),
    ];

    expect(() => validateWorkflowReferences(steps)).not.toThrow();
  });
});
