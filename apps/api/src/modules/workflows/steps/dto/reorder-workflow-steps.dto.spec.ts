import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderWorkflowStepsDto } from './reorder-workflow-steps.dto';
import { MAX_STEPS_PER_WORKFLOW } from '../validation/workflow-step.validator';

async function validateInput(input: Record<string, unknown>) {
  const instance = plainToInstance(ReorderWorkflowStepsDto, input);
  return validate(instance);
}

describe('ReorderWorkflowStepsDto', () => {
  it('accepts a valid stepIds array', async () => {
    const errors = await validateInput({ stepIds: ['b', 'a', 'c'] });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing stepIds field', async () => {
    const errors = await validateInput({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-array stepIds value', async () => {
    const errors = await validateInput({ stepIds: 'a,b,c' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty array', async () => {
    const errors = await validateInput({ stepIds: [] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-string entries', async () => {
    const errors = await validateInput({ stepIds: ['a', 1, 'c'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty-string entry', async () => {
    const errors = await validateInput({ stepIds: ['a', '', 'c'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a whitespace-only entry', async () => {
    const errors = await validateInput({ stepIds: ['a', '   ', 'c'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate IDs', async () => {
    const errors = await validateInput({ stepIds: ['a', 'b', 'a'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an array exceeding MAX_STEPS_PER_WORKFLOW', async () => {
    const stepIds = Array.from(
      { length: MAX_STEPS_PER_WORKFLOW + 1 },
      (_, index) => `step-${index}`,
    );
    const errors = await validateInput({ stepIds });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts an array at exactly MAX_STEPS_PER_WORKFLOW', async () => {
    const stepIds = Array.from(
      { length: MAX_STEPS_PER_WORKFLOW },
      (_, index) => `step-${index}`,
    );
    const errors = await validateInput({ stepIds });
    expect(errors).toHaveLength(0);
  });
});
