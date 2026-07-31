import type { ApplicationRole } from '../../modules/auth/auth.types';

/**
 * The authenticated actor a controller passes to a domain service. Services
 * use this to scope every user-facing query — never a client-supplied ID.
 */
export interface AuthenticatedActor {
  userId: string;
  role: ApplicationRole;
}
