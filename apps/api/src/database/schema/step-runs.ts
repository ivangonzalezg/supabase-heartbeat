import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workflowRuns } from './workflow-runs';
import { workflowSteps } from './workflow-steps';

export const stepRuns = sqliteTable(
  'step_runs',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    workflowStepId: text('workflow_step_id')
      .notNull()
      .references(() => workflowSteps.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // Same status set as workflow_runs.
    status: text('status').notNull(),
    inputSnapshot: text('input_snapshot', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    output: text('output', { mode: 'json' }).$type<Record<string, unknown>>(),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('step_runs_workflow_run_id_idx').on(table.workflowRunId),
    index('step_runs_workflow_step_id_idx').on(table.workflowStepId),
  ],
);
