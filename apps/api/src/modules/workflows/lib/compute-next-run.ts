import { CronJob } from 'cron';

/**
 * Pure date-math utility shared by every "overview" endpoint that needs a
 * workflow's next scheduled fire time (`ProjectsService.findOverview`,
 * `WorkflowsService.findOverview`, `OverviewService.get`). The returned
 * `CronJob` is never `.start()`ed, only used for its `.nextDate()`
 * calculation — this introduces no scheduler and has no relation to
 * `WorkflowSchedulerService`'s live registry.
 */
export function computeNextRun(workflow: {
  cronExpression: string;
  timezone: string;
  enabled: boolean;
}): Date | null {
  if (!workflow.enabled) {
    return null;
  }
  try {
    const job = CronJob.from({
      cronTime: workflow.cronExpression,
      timeZone: workflow.timezone,
      // `onTick` is required by the type signature but never invoked.
      onTick: () => {},
    });
    return job.nextDate().toJSDate();
  } catch {
    // Defensive: cronExpression is already validated at write time
    // (IsCronExpression), so this should be unreachable in practice.
    return null;
  }
}
