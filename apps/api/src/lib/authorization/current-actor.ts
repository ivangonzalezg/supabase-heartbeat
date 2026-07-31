import { InternalServerErrorException } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { APPLICATION_ROLES } from '../../modules/auth/auth.types';
import type { AuthenticatedActor } from './authorization.types';

/**
 * Converts the Better Auth session (obtained via `@Session()`) into the
 * smaller `AuthenticatedActor` shape services expect. Better Auth types
 * `user.role` as `string | string[] | undefined` at the library level;
 * this narrows it to the application's own closed `ApplicationRole` set
 * and fails loudly if a session ever carries anything else, rather than
 * silently trusting an unexpected value.
 */
export function toAuthenticatedActor(session: UserSession): AuthenticatedActor {
  const rawRole = session.user.role;
  const role = Array.isArray(rawRole) ? rawRole[0] : rawRole;

  if (!isApplicationRole(role)) {
    throw new InternalServerErrorException(
      `Authenticated user has an unexpected role: ${JSON.stringify(rawRole)}`,
    );
  }

  return { userId: session.user.id, role };
}

function isApplicationRole(
  role: unknown,
): role is (typeof APPLICATION_ROLES)[number] {
  return (
    typeof role === 'string' &&
    (APPLICATION_ROLES as readonly string[]).includes(role)
  );
}
