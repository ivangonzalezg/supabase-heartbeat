import { ConflictException } from '@nestjs/common';

/**
 * Every error in this file follows the same convention as the rest of
 * this codebase's domain errors (`ProjectNotFoundError`,
 * `WorkflowStepOrderConflictError`, etc.): it extends a NestJS HTTP
 * exception directly, so it can be thrown straight from a CRUD service
 * and produce the correct HTTP response with no translation step. The
 * same classes are also safe to throw from the manual-run execution
 * loop (`WorkflowRunsService`): `serializeExecutionError` treats any
 * non-`StepExecutionError` thrown value as a technical failure and, once
 * a class is added to its `SAFE_ERROR_TYPES` allowlist, reads only its
 * `.message` — every message below is built entirely from step
 * identity, referenced-step identity, and a safe reference path, never
 * from output values, configuration values, or third-party data.
 *
 * `path` is rendered with a fixed, deterministic joiner (`formatPath`)
 * so a safe reference path like `rows.0.id` never risks looking like
 * attacker-controlled formatting.
 */
function formatPath(path: ReadonlyArray<string | number>): string {
  return path.map(String).join('.');
}

/**
 * Thrown when a string that begins the reference syntax (`${steps.`)
 * does not parse as one complete, well-formed
 * `${steps.<step_key>.output.<path>}` reference — malformed braces, a
 * missing `output` segment, bracket notation, an invalid `stepKey`, an
 * empty path segment, a negative index, or the reference is only part
 * of a larger string (partial interpolation, not supported). Never
 * includes the offending raw string, since it may contain arbitrary
 * user-authored configuration text.
 *
 * Structural reference errors in this file (this class and the three
 * below) are all `ConflictException` (409): each represents a proposed
 * workflow state that conflicts with the workflow's own existing
 * structure (another step's reference, the current step order, or
 * enabled/disabled state) — the same category `WorkflowStepOrderConflictError`
 * already uses for a structurally-invalid reorder request, and the
 * status this task's own reorder-integration requirement asks for
 * ("reorder would invalidate references → 409 Conflict"). Using one
 * status uniformly across create/update/reorder avoids the caller
 * needing to know, case by case, whether a given structural violation
 * "feels like" a 400 or a 409.
 */
export class InvalidStepReferenceSyntaxError extends ConflictException {
  constructor(input: { stepKey: string; configurationPath: string }) {
    super(
      `Step "${input.stepKey}" has a malformed step-output reference at ` +
        `"${input.configurationPath}". References must have the exact ` +
        'form ${steps.<step_key>.output.<path>} and occupy the complete ' +
        'string value.',
    );
    this.name = 'InvalidStepReferenceSyntaxError';
  }
}

/**
 * Thrown when a reference names a `stepKey` that does not exist anywhere
 * in the same workflow.
 */
export class ReferencedStepNotFoundError extends ConflictException {
  constructor(input: { stepKey: string; referencedStepKey: string }) {
    super(
      `Step "${input.stepKey}" references unknown step ` +
        `"${input.referencedStepKey}".`,
    );
    this.name = 'ReferencedStepNotFoundError';
  }
}

/**
 * Thrown when a reference names a step that exists but appears at the
 * same position or later in execution order — including a step
 * referencing itself. Because only earlier steps may ever be
 * referenced, a structurally valid workflow can never contain a
 * reference cycle; this check is what prevents cycles by construction,
 * not a separate graph-cycle detector.
 */
export class ForwardStepReferenceError extends ConflictException {
  constructor(input: { stepKey: string; referencedStepKey: string }) {
    super(
      `Step "${input.stepKey}" cannot reference step ` +
        `"${input.referencedStepKey}", which does not appear earlier in ` +
        'execution order.',
    );
    this.name = 'ForwardStepReferenceError';
  }
}

/**
 * Thrown when a reference names a step that exists and is earlier in
 * order, but is disabled. Disabled steps never execute and never
 * produce a runtime output, so they can never be referenced by an
 * enabled step.
 */
export class DisabledStepReferenceError extends ConflictException {
  constructor(input: { stepKey: string; referencedStepKey: string }) {
    super(
      `Step "${input.stepKey}" references step ` +
        `"${input.referencedStepKey}", which is disabled. Only enabled ` +
        'steps can be referenced.',
    );
    this.name = 'DisabledStepReferenceError';
  }
}

/**
 * Thrown at runtime when a reference's path cannot be resolved against
 * the referenced step's actual output for this run — a missing object
 * property, a missing array index, indexing a non-array, or accessing a
 * property on a primitive. Never includes the referenced output's
 * value, only the safe path that could not be resolved.
 */
export class StepReferenceResolutionError extends Error {
  constructor(input: {
    stepKey: string;
    referencedStepKey: string;
    path: ReadonlyArray<string | number>;
  }) {
    super(
      `Step "${input.stepKey}" could not resolve path ` +
        `"${formatPath(input.path)}" from step "${input.referencedStepKey}".`,
    );
    this.name = 'StepReferenceResolutionError';
  }
}

/**
 * Thrown when every reference in a step's configuration resolved
 * successfully, but the resulting configuration fails the shared
 * runtime schema for that step's type (e.g. a resolved value is a
 * number where the schema requires a string). Never includes the
 * resolved value or the raw Zod issue payload.
 */
export class ResolvedStepConfigurationError extends Error {
  constructor(input: { stepKey: string; stepType: string }) {
    super(
      `Step "${input.stepKey}" (${input.stepType}) has a resolved ` +
        'configuration that does not satisfy its type after references ' +
        'were substituted.',
    );
    this.name = 'ResolvedStepConfigurationError';
  }
}

/**
 * Thrown when deleting or renaming a step that another enabled step
 * still references. Identifies both step keys so the caller can repair
 * the workflow, without exposing either step's configuration.
 */
export class ReferencedStepDeletionConflictError extends ConflictException {
  constructor(input: { stepKey: string; referencingStepKey: string }) {
    super(
      `Step "${input.stepKey}" cannot be deleted because it is ` +
        `referenced by step "${input.referencingStepKey}".`,
    );
    this.name = 'ReferencedStepDeletionConflictError';
  }
}

/**
 * Thrown when renaming a step's `stepKey` would leave another enabled
 * step's reference pointing at a key that no longer exists.
 */
export class ReferencedStepRenameConflictError extends ConflictException {
  constructor(input: { stepKey: string; referencingStepKey: string }) {
    super(
      `Step "${input.stepKey}" cannot be renamed because it is ` +
        `referenced by step "${input.referencingStepKey}".`,
    );
    this.name = 'ReferencedStepRenameConflictError';
  }
}
