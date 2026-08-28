export interface SchedulerConfig {
  enabled: boolean;
}

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Reads SCHEDULER_ENABLED from the environment. Defaults to disabled
 * (unset, empty, or any value not in the truthy set) — scheduling is
 * opt-in, so existing deployments and test environments never start
 * running cron jobs implicitly.
 */
export function readSchedulerConfig(): SchedulerConfig {
  const raw = process.env.SCHEDULER_ENABLED?.trim().toLowerCase() ?? '';
  return { enabled: TRUTHY_VALUES.has(raw) };
}
