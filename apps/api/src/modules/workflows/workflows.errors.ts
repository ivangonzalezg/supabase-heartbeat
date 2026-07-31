import { NotFoundException } from '@nestjs/common';

/**
 * Thrown when a workflow does not exist, belongs to a project other than
 * the one specified in the route, or belongs to a project the actor does
 * not own. All three cases return the same 404 response — the API never
 * discloses which parent or child resource actually exists.
 */
export class WorkflowNotFoundError extends NotFoundException {
  constructor() {
    super('Workflow not found.');
  }
}
