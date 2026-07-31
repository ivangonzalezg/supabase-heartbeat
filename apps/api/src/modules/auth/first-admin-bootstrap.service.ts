import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { users } from '../../database/schema';
import type { Auth } from './auth.config';
import { readFirstAdminBootstrapConfig } from './first-admin-bootstrap.config';

/**
 * Creates the first administrator from FIRST_ADMIN_EMAIL /
 * FIRST_ADMIN_PASSWORD / FIRST_ADMIN_NAME, once per application startup,
 * only when no administrator currently exists. See
 * apps/api/README.md ("First-administrator bootstrap") for the full
 * behavior matrix.
 */
@Injectable()
export class FirstAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FirstAdminBootstrapService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(AuthService) private readonly authService: AuthService<Auth>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Cast through Better Auth's own public `BetterAuthOptions` type: the
    // app's `createAuth` factory return type only carries the literal
    // shape of the object it was given (which never sets these two
    // fields), but `auth.options` at runtime is the same options object
    // Better Auth's own context derives these bounds from (see
    // inspection.md for the source-verified default values: 8 / 128).
    const emailAndPasswordOptions = this.authService.instance.options
      .emailAndPassword as BetterAuthOptions['emailAndPassword'];
    const passwordLengthBounds = {
      minPasswordLength: emailAndPasswordOptions?.minPasswordLength ?? 8,
      maxPasswordLength: emailAndPasswordOptions?.maxPasswordLength ?? 128,
    };

    const config = readFirstAdminBootstrapConfig(passwordLengthBounds);

    if (!config.configured) {
      this.logger.debug('First-admin bootstrap is not configured; skipping.');
      return;
    }

    const db = this.databaseService.db;

    const existingAdmin = await this.queryFirstRow(
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1),
    );
    if (existingAdmin) {
      this.logger.log(
        'An administrator already exists; first-admin bootstrap skipped.',
      );
      return;
    }

    const existingUserWithConfiguredEmail = await this.queryFirstRow(
      db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.email, config.email))
        .limit(1),
    );

    if (existingUserWithConfiguredEmail) {
      if (existingUserWithConfiguredEmail.role === 'admin') {
        this.logger.log(
          `The configured administrator (${config.email}) already exists; ` +
            'first-admin bootstrap skipped.',
        );
        return;
      }

      throw new InternalServerErrorException(
        `First-admin bootstrap failed: an account already exists for ` +
          `${config.email} with a role other than admin. Refusing to ` +
          'promote it automatically. Use a different FIRST_ADMIN_EMAIL, or ' +
          "change this account's role through the admin API instead.",
      );
    }

    const createdUser = await this.authService.api.createUser({
      body: {
        email: config.email,
        password: config.password,
        name: config.name,
        role: 'admin',
      },
    });

    if (
      !createdUser?.user ||
      createdUser.user.email !== config.email ||
      createdUser.user.role !== 'admin'
    ) {
      throw new InternalServerErrorException(
        'First-admin bootstrap failed: the created user did not have the ' +
          'expected email or admin role.',
      );
    }

    this.logger.log(
      `First administrator created successfully: ${createdUser.user.email} ` +
        `(id: ${createdUser.user.id})`,
    );
  }

  /**
   * Runs a Drizzle select and returns its first row (or `undefined`),
   * converting a missing-table SQLite error into a clear migration-guidance
   * error rather than letting the raw driver error surface. Migrations are
   * never run automatically (see AGENTS.md) — this only detects the
   * unmigrated case and fails loudly.
   */
  private async queryFirstRow<T>(
    query: PromiseLike<T[]>,
  ): Promise<T | undefined> {
    try {
      const rows = await query;
      return rows[0];
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new InternalServerErrorException(
          'First-admin bootstrap could not inspect users because the ' +
            'database schema is not migrated. Run the API database ' +
            'migration command (db:migrate) before startup.',
        );
      }
      throw error;
    }
  }
}

function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}
