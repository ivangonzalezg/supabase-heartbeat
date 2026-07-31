import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    cronExpression: text('cron_expression').notNull(),
    timezone: text('timezone').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    // Initial supported value: 'skip'. More policies may be added later.
    overlapPolicy: text('overlap_policy').notNull().default('skip'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('workflows_project_id_idx').on(table.projectId)],
);
