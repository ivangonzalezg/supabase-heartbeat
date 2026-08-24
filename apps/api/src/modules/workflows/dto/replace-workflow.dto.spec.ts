import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplaceWorkflowDto } from './replace-workflow.dto';

async function validateInput(input: Record<string, unknown>) {
  const instance = plainToInstance(ReplaceWorkflowDto, input);
  return validate(instance);
}

const validBase = {
  name: 'Nightly heartbeat',
  cronExpression: '0 */6 * * *',
  timezone: 'UTC',
};

describe('ReplaceWorkflowDto', () => {
  it('accepts a step entry carrying an id (identifying an existing step to update)', async () => {
    const errors = await validateInput({
      ...validBase,
      steps: [
        {
          id: 'existing-step-id',
          stepKey: 'wait_1',
          type: 'wait',
          configuration: { seconds: 5 },
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a step entry with no id (a new step to create)', async () => {
    const errors = await validateInput({
      ...validBase,
      steps: [
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 5 } },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a mismatched type/configuration pair even with an id present', async () => {
    const errors = await validateInput({
      ...validBase,
      steps: [
        {
          id: 'existing-step-id',
          stepKey: 'wait_1',
          type: 'wait',
          configuration: { table: 'profiles' },
        },
      ],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty steps array', async () => {
    const errors = await validateInput({ ...validBase, steps: [] });
    expect(errors.length).toBeGreaterThan(0);
  });
});
