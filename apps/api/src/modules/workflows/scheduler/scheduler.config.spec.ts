import { readSchedulerConfig } from './scheduler.config';

describe('readSchedulerConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled when SCHEDULER_ENABLED is unset', () => {
    delete process.env.SCHEDULER_ENABLED;

    expect(readSchedulerConfig()).toEqual({ enabled: false });
  });

  it('is disabled when SCHEDULER_ENABLED is empty', () => {
    process.env.SCHEDULER_ENABLED = '';

    expect(readSchedulerConfig()).toEqual({ enabled: false });
  });

  it.each(['false', '0', 'no', 'off', 'garbage'])(
    'is disabled for SCHEDULER_ENABLED=%s',
    (value) => {
      process.env.SCHEDULER_ENABLED = value;

      expect(readSchedulerConfig()).toEqual({ enabled: false });
    },
  );

  it.each(['1', 'true', 'yes', 'on', 'TRUE', 'On', '  true  '])(
    'is enabled for SCHEDULER_ENABLED=%s',
    (value) => {
      process.env.SCHEDULER_ENABLED = value;

      expect(readSchedulerConfig()).toEqual({ enabled: true });
    },
  );
});
