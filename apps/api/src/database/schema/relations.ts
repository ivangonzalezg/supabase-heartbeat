import { relations } from 'drizzle-orm';
import { users } from './auth';
import { projects } from './projects';
import { workflows } from './workflows';
import { workflowSteps } from './workflow-steps';
import { workflowRuns } from './workflow-runs';
import { stepRuns } from './step-runs';

export const usersToProjectsRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  project: one(projects, {
    fields: [workflows.projectId],
    references: [projects.id],
  }),
  steps: many(workflowSteps),
  runs: many(workflowRuns),
}));

export const workflowStepsRelations = relations(
  workflowSteps,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowSteps.workflowId],
      references: [workflows.id],
    }),
    stepRuns: many(stepRuns),
  }),
);

export const workflowRunsRelations = relations(
  workflowRuns,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowRuns.workflowId],
      references: [workflows.id],
    }),
    stepRuns: many(stepRuns),
  }),
);

export const stepRunsRelations = relations(stepRuns, ({ one }) => ({
  workflowRun: one(workflowRuns, {
    fields: [stepRuns.workflowRunId],
    references: [workflowRuns.id],
  }),
  workflowStep: one(workflowSteps, {
    fields: [stepRuns.workflowStepId],
    references: [workflowSteps.id],
  }),
}));
