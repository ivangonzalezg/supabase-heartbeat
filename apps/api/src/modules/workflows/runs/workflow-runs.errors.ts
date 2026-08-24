import { NotFoundException } from '@nestjs/common';

/**
 * Thrown when a workflow run does not exist, or belongs to a workflow
 * other than the one specified in the route. Mirrors
 * `WorkflowNotFoundError`'s convention: the API never discloses which
 * parent or child resource actually exists.
 */
export class WorkflowRunNotFoundError extends NotFoundException {
  constructor() {
    super('Workflow run not found.');
  }
}
