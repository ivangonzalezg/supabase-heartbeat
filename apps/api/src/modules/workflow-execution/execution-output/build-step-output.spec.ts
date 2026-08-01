import { describe, expect, it } from '@jest/globals';
import {
  buildInvokeFunctionStepOutput,
  buildTableStepOutput,
} from './build-step-output';
import { InvalidStepExecutionOutputError } from './step-execution-output.errors';

const identity = {
  stepId: 'step-1',
  stepKey: 'a',
  stepType: 'insert' as const,
};
const functionIdentity = {
  stepId: 'step-1',
  stepKey: 'a',
  stepType: 'invoke_function' as const,
};

describe('buildTableStepOutput', () => {
  it('returns rows and a matching count for valid rows', () => {
    const result = buildTableStepOutput(identity, [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]);

    expect(result).toEqual({
      rows: [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
      ],
      count: 2,
    });
  });

  it('returns an empty rows array and zero count for no rows', () => {
    expect(buildTableStepOutput(identity, [])).toEqual({ rows: [], count: 0 });
  });

  it('throws InvalidStepExecutionOutputError for a primitive row', () => {
    expect(() => buildTableStepOutput(identity, ['not-an-object'])).toThrow(
      InvalidStepExecutionOutputError,
    );
  });

  it('throws InvalidStepExecutionOutputError for a row containing a non-finite number', () => {
    expect(() =>
      buildTableStepOutput(identity, [{ score: Number.NaN }]),
    ).toThrow(InvalidStepExecutionOutputError);
  });

  it('never includes the rejected row value in the thrown error message', () => {
    try {
      buildTableStepOutput(identity, ['secret-row-value-should-not-leak']);
      throw new Error('expected buildTableStepOutput to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStepExecutionOutputError);
      expect((error as Error).message).not.toContain(
        'secret-row-value-should-not-leak',
      );
    }
  });

  it('count always equals rows.length', () => {
    const result = buildTableStepOutput(identity, [
      { a: 1 },
      { a: 2 },
      { a: 3 },
    ]);
    expect(result.count).toBe(result.rows.length);
  });
});

describe('buildInvokeFunctionStepOutput', () => {
  it('preserves a JSON object result', () => {
    expect(
      buildInvokeFunctionStepOutput(functionIdentity, { ok: true }),
    ).toEqual({
      data: { ok: true },
    });
  });

  it('preserves an array result', () => {
    expect(buildInvokeFunctionStepOutput(functionIdentity, [1, 2, 3])).toEqual({
      data: [1, 2, 3],
    });
  });

  it('preserves a string result', () => {
    expect(buildInvokeFunctionStepOutput(functionIdentity, 'done')).toEqual({
      data: 'done',
    });
  });

  it('preserves a number result', () => {
    expect(buildInvokeFunctionStepOutput(functionIdentity, 42)).toEqual({
      data: 42,
    });
  });

  it('preserves a boolean result', () => {
    expect(buildInvokeFunctionStepOutput(functionIdentity, false)).toEqual({
      data: false,
    });
  });

  it('preserves null as a distinct success value, not {}', () => {
    expect(buildInvokeFunctionStepOutput(functionIdentity, null)).toEqual({
      data: null,
    });
  });

  it('throws InvalidStepExecutionOutputError for a Blob-like unsafe value', () => {
    class FakeBlob {
      size = 0;
    }
    expect(() =>
      buildInvokeFunctionStepOutput(functionIdentity, new FakeBlob()),
    ).toThrow(InvalidStepExecutionOutputError);
  });

  it('throws InvalidStepExecutionOutputError for undefined', () => {
    expect(() =>
      buildInvokeFunctionStepOutput(functionIdentity, undefined),
    ).toThrow(InvalidStepExecutionOutputError);
  });
});
