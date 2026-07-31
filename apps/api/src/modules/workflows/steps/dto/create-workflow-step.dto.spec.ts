import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorkflowStepDto } from './create-workflow-step.dto';

async function validateInput(input: Record<string, unknown>) {
  const instance = plainToInstance(CreateWorkflowStepDto, input);
  return validate(instance);
}

describe('CreateWorkflowStepDto', () => {
  it('accepts a valid signin step', async () => {
    const errors = await validateInput({
      stepKey: 'sign-in',
      type: 'signin',
      configuration: {},
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid wait step', async () => {
    const errors = await validateInput({
      stepKey: 'pause',
      type: 'wait',
      configuration: { seconds: 5 },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a mismatched type/configuration pair', async () => {
    const errors = await validateInput({
      stepKey: 'pause',
      type: 'wait',
      configuration: { table: 'profiles' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid stepKey', async () => {
    const errors = await validateInput({
      stepKey: 'Sign In',
      type: 'signin',
      configuration: {},
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an unsupported type', async () => {
    const errors = await validateInput({
      stepKey: 'bogus',
      type: 'bogus_type',
      configuration: {},
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing stepKey', async () => {
    const errors = await validateInput({
      type: 'signin',
      configuration: {},
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
