import type { ProjectResponse } from '../projects/projects.types';
import type { WorkflowResponse } from '../workflows/workflows.types';

/**
 * Cross-project summary for sidebar-style project/workflow switching, in a
 * single round-trip. Reuses the same public shapes as `GET /api/projects`
 * and `GET /api/projects/:projectId/workflows` (full field set, no step
 * data) rather than a separately reduced shape — the trade-off between
 * request count and payload size is single-round-trip-friendly here, not
 * field-reduction-friendly. Scoped to the actor's own projects only, same
 * ownership model as ProjectsService.list / WorkflowsService.list.
 */
export interface WorkspaceSummaryResponse {
  projects: ProjectResponse[];
  workflows: WorkflowResponse[];
}
