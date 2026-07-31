import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workflows } from './workflows';

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    // 'manual' | 'scheduled'
    triggerType: text('trigger_type').notNull(),
    // 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped'
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('workflow_runs_workflow_id_idx').on(table.workflowId)],
);
