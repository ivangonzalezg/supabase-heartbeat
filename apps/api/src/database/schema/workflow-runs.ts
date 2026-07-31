import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { workflows } from './workflows';
import {
  sqlInList,
  workflowRunStatuses,
  workflowRunTriggerTypes,
} from './types';

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type', {
      enum: workflowRunTriggerTypes,
    }).notNull(),
    status: text('status', { enum: workflowRunStatuses }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('workflow_runs_workflow_id_idx').on(table.workflowId),
    check(
      'workflow_runs_trigger_type_check',
      sql`${table.triggerType} IN (${sql.raw(sqlInList(workflowRunTriggerTypes))})`,
    ),
    check(
      'workflow_runs_status_check',
      sql`${table.status} IN (${sql.raw(sqlInList(workflowRunStatuses))})`,
    ),
  ],
);
