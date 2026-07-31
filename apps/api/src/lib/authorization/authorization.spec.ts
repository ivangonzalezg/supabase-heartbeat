import { ForbiddenException } from '@nestjs/common';
import { ForbiddenResourceError } from './authorization.errors';
import type { AuthenticatedActor } from './authorization.types';

describe('ForbiddenResourceError', () => {
  it('is a NestJS ForbiddenException carrying the resource name', () => {
    const error = new ForbiddenResourceError('project');

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe('You do not have access to this project.');
    expect(error.getStatus()).toBe(403);
  });
});

describe('AuthenticatedActor', () => {
  it('carries a userId and an application role', () => {
    const actor: AuthenticatedActor = { userId: 'user-1', role: 'admin' };

    expect(actor.userId).toBe('user-1');
    expect(actor.role).toBe('admin');
  });
});
