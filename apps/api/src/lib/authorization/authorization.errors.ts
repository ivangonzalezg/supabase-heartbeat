import { ForbiddenException } from '@nestjs/common';

/**
 * Thrown by a domain service when the current actor does not own (or
 * otherwise lack access to) a requested resource. Services should throw
 * this instead of returning a row looked up without an ownership scope.
 */
export class ForbiddenResourceError extends ForbiddenException {
  constructor(resource: string) {
    super(`You do not have access to this ${resource}.`);
  }
}
