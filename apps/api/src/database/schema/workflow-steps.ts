import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { workflows } from './workflows';

export const workflowSteps = sqliteTable(
  'workflow_steps',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    type: text('type').notNull(),
    position: integer('position').notNull(),
    // Executor-specific configuration. Structural validation happens in the
    // application layer (shared validation package), not the database.
    configuration: text('configuration', { mode: 'json' })
      .notNull()
      .$type<Record<string, unknown>>(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('workflow_steps_workflow_id_idx').on(table.workflowId),
    unique('workflow_steps_workflow_id_step_key_unique').on(
      table.workflowId,
      table.stepKey,
    ),
    unique('workflow_steps_workflow_id_position_unique').on(
      table.workflowId,
      table.position,
    ),
  ],
);
