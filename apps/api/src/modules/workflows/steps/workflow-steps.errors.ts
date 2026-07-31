import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * Thrown when a step does not exist, belongs to a workflow other than the
 * one specified in the route, or belongs to a workflow/project the actor
 * cannot access. All cases return the same 404 response — the API never
 * discloses which part of the hierarchy (project, workflow, or step)
 * actually exists.
 */
export class WorkflowStepNotFoundError extends NotFoundException {
  constructor() {
    super('Workflow step not found.');
  }
}

/**
 * Thrown when a `stepKey` submitted for creation or update already exists
 * within the same workflow. The database's own
 * `workflow_steps_workflow_id_step_key_unique` constraint is the final
 * guarantee; this error maps that failure (and the same check performed
 * proactively before insert) to a stable, non-leaking domain response.
 */
export class DuplicateStepKeyError extends ConflictException {
  constructor() {
    super('A step with this stepKey already exists in this workflow.');
  }
}

/**
 * Thrown when deleting a step would leave the workflow with zero steps.
 * A workflow without any steps cannot be created through the aggregate
 * endpoint (at least one step is required); for consistency, deleting
 * the last remaining step is also rejected rather than silently
 * producing an empty workflow. The workflow itself can still be deleted
 * through the workflow endpoint.
 */
export class LastStepDeletionError extends ConflictException {
  constructor() {
    super(
      'Cannot delete the last remaining step of a workflow. Delete the ' +
        'workflow itself instead.',
    );
  }
}
