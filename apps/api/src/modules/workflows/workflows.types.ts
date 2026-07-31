import type { WorkflowOverlapPolicy } from '../../database/schema/types';

/**
 * The public HTTP representation of a workflow. Mapped by hand from the
 * Drizzle row, mirroring the Projects module's convention, so the API's
 * camelCase, stable field set stays decoupled from the database's own
 * column set. Never exposes the parent project's owner.
 */
export interface WorkflowResponse {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  overlapPolicy: WorkflowOverlapPolicy;
  createdAt: Date;
  updatedAt: Date;
}
