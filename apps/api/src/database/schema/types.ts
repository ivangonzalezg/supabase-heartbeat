import type { users } from './auth';
import type { projects } from './projects';
import type { workflows } from './workflows';
import type { workflowSteps } from './workflow-steps';
import type { workflowRuns } from './workflow-runs';
import type { stepRuns } from './step-runs';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;
