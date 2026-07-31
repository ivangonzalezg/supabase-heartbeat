import { InternalServerErrorException } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { toAuthenticatedActor } from './current-actor';

function buildSession(role: unknown): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

describe('toAuthenticatedActor', () => {
  it('maps a session with role "admin" to an admin actor', () => {
    expect(toAuthenticatedActor(buildSession('admin'))).toEqual({
      userId: 'user-1',
      role: 'admin',
    });
  });

  it('maps a session with role "viewer" to a viewer actor', () => {
    expect(toAuthenticatedActor(buildSession('viewer'))).toEqual({
      userId: 'user-1',
      role: 'viewer',
    });
  });

  it('takes the first role when Better Auth returns an array of roles', () => {
    expect(toAuthenticatedActor(buildSession(['admin', 'viewer']))).toEqual({
      userId: 'user-1',
      role: 'admin',
    });
  });

  it('throws when the role is missing', () => {
    expect(() => toAuthenticatedActor(buildSession(undefined))).toThrow(
      InternalServerErrorException,
    );
  });

  it('throws when the role is not a recognized application role', () => {
    expect(() => toAuthenticatedActor(buildSession('superuser'))).toThrow(
      InternalServerErrorException,
    );
  });
});
