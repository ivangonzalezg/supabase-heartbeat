import type { WorkflowStepType } from '@supabase-heartbeat/validation';

/**
 * The public HTTP representation of a workflow step. Mapped by hand from
 * the Drizzle row, mirroring the Projects/Workflows modules' convention,
 * so the API's camelCase, stable field set stays decoupled from the
 * database's own column set.
 */
export interface WorkflowStepResponse {
  id: string;
  workflowId: string;
  stepKey: string;
  type: WorkflowStepType;
  position: number;
  configuration: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
