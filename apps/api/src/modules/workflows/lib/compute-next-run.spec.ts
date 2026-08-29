import { computeNextRun } from './compute-next-run';

describe('computeNextRun', () => {
  it('returns null for a disabled workflow', () => {
    const result = computeNextRun({
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: false,
    });

    expect(result).toBeNull();
  });

  it('returns the next fire time for a valid cron expression', () => {
    const result = computeNextRun({
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
      enabled: true,
    });

    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null for an invalid cron expression', () => {
    const result = computeNextRun({
      cronExpression: 'not a cron expression',
      timezone: 'UTC',
      enabled: true,
    });

    expect(result).toBeNull();
  });
});
