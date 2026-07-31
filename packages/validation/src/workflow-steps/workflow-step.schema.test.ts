import { describe, expect, it } from 'vitest';
import {
  parseWorkflowStepConfiguration,
  STEP_KEY_MAX_LENGTH,
  stepKeySchema,
  workflowStepCreateSchema,
} from './workflow-step.schema.js';

describe('stepKeySchema', () => {
  it.each(['sign-in', 'read_profile', 'step1', 'a', 'a-b_c-1'])(
    'accepts %s',
    (value) => {
      expect(stepKeySchema.safeParse(value).success).toBe(true);
    },
  );

  it('trims surrounding whitespace before validating', () => {
    const result = stepKeySchema.safeParse('  sign-in  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('sign-in');
    }
  });

  it('rejects an empty string', () => {
    expect(stepKeySchema.safeParse('').success).toBe(false);
  });

  it('rejects whitespace inside the key', () => {
    expect(stepKeySchema.safeParse('sign in').success).toBe(false);
  });

  it('rejects a dot', () => {
    expect(stepKeySchema.safeParse('sign.in').success).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(stepKeySchema.safeParse('SignIn').success).toBe(false);
  });

  it('rejects a key over the maximum length', () => {
    expect(stepKeySchema.safeParse('a'.repeat(STEP_KEY_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  it('accepts a key at exactly the maximum length', () => {
    expect(stepKeySchema.safeParse('a'.repeat(STEP_KEY_MAX_LENGTH)).success).toBe(
      true,
    );
  });
});

describe('workflowStepCreateSchema', () => {
  it('accepts a valid signin step', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'sign-in',
        type: 'signin',
        configuration: {},
      }).success,
    ).toBe(true);
  });

  it('rejects a signin step with credential-shaped configuration', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'sign-in',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'secret' },
      }).success,
    ).toBe(false);
  });

  it('accepts a valid wait step', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'pause',
        type: 'wait',
        configuration: { seconds: 5 },
      }).success,
    ).toBe(true);
  });

  it('rejects a wait step with a mismatched configuration (read-shaped)', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'pause',
        type: 'wait',
        configuration: { table: 'profiles' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported step type', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'bogus',
        type: 'bogus_type',
        configuration: {},
      }).success,
    ).toBe(false);
  });

  it('accepts an optional enabled flag', () => {
    const result = workflowStepCreateSchema.safeParse({
      stepKey: 'sign-in',
      type: 'signin',
      configuration: {},
      enabled: false,
    });
    expect(result.success).toBe(true);
    if (result.success && 'enabled' in result.data) {
      expect(result.data.enabled).toBe(false);
    }
  });

  it('rejects unexpected top-level fields (e.g. position, id)', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'sign-in',
        type: 'signin',
        configuration: {},
        position: 0,
      }).success,
    ).toBe(false);
    expect(
      workflowStepCreateSchema.safeParse({
        stepKey: 'sign-in',
        type: 'signin',
        configuration: {},
        id: 'some-id',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing stepKey', () => {
    expect(
      workflowStepCreateSchema.safeParse({
        type: 'signin',
        configuration: {},
      }).success,
    ).toBe(false);
  });
});

describe('parseWorkflowStepConfiguration', () => {
  it('validates a type/configuration pair alone, without stepKey', () => {
    expect(
      parseWorkflowStepConfiguration({
        type: 'signout',
        configuration: {},
      }).success,
    ).toBe(true);
  });

  it('rejects a mismatched pair', () => {
    expect(
      parseWorkflowStepConfiguration({
        type: 'signout',
        configuration: { seconds: 5 },
      }).success,
    ).toBe(false);
  });
});
