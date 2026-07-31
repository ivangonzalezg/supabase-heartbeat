import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { workflows } from './workflows';
import { sqlInList, workflowStepTypes } from './types';

export const workflowSteps = sqliteTable(
  'workflow_steps',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    type: text('type', { enum: workflowStepTypes }).notNull(),
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
    check(
      'workflow_steps_type_check',
      sql`${table.type} IN (${sql.raw(sqlInList(workflowStepTypes))})`,
    ),
    check('workflow_steps_position_check', sql`${table.position} >= 0`),
  ],
);
