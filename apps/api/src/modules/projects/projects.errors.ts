import { NotFoundException } from '@nestjs/common';

/**
 * Thrown for both a nonexistent project and a project owned by another
 * user. Both cases return the same 404 response — the API never discloses
 * whether a project ID exists for someone else's account.
 */
export class ProjectNotFoundError extends NotFoundException {
  constructor() {
    super('Project not found.');
  }
}
