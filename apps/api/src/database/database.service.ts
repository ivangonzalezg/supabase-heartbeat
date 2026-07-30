import { mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { getDatabasePath } from './database.constants';
import * as schema from './schema';
import type { AppDatabase } from './database.types';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly connection: Database.Database;
  readonly db: AppDatabase;

  constructor() {
    const databasePath = getDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });

    try {
      this.connection = new Database(databasePath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to open SQLite database at "${databasePath}": ${reason}`,
      );
    }

    // Enforce referential integrity; off by default in SQLite.
    this.connection.pragma('foreign_keys = ON');
    // Allows concurrent reads while a write is in progress, better suited
    // to a server process than the default rollback journal.
    this.connection.pragma('journal_mode = WAL');

    this.db = drizzle(this.connection, { schema });
  }

  onModuleInit(): void {
    this.db.run(sql`select 1`);
    this.logger.log('Database connection verified');
  }

  onApplicationShutdown(): void {
    this.connection.close();
  }
}
