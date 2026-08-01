import type { JsonObject, JsonValue } from '@supabase-heartbeat/validation';
import { isJsonSafeObject, isJsonSafeValue } from './normalize-step-output';
import { InvalidStepExecutionOutputError } from './step-execution-output.errors';

interface StepIdentity {
  stepId: string;
  stepKey: string;
  stepType: 'insert' | 'read' | 'update' | 'delete';
}

/**
 * Builds the stable `{ rows, count }` output shared by `insert`, `read`,
 * `update`, and `delete`. `rawRows` is expected to already be an array
 * (callers pass `data ?? []`, having already decided that a `null` SDK
 * response means "no rows" for their operation — see each executor).
 * Every row must normalize to a JSON object; a primitive row or any
 * non-JSON-safe value anywhere in the row throws
 * `InvalidStepExecutionOutputError` rather than silently coercing or
 * dropping data. `count` is always `rows.length` — never a separate
 * SDK-reported count, so the two fields can never disagree.
 */
export function buildTableStepOutput(
  identity: StepIdentity,
  rawRows: readonly unknown[],
): { rows: JsonObject[]; count: number } {
  const rows = rawRows.map((row) => {
    if (!isJsonSafeObject(row)) {
      throw new InvalidStepExecutionOutputError({
        ...identity,
        reason: 'row-not-an-object',
      });
    }
    return row;
  });

  return { rows, count: rows.length };
}

/**
 * Builds the stable `{ data }` output for `invoke_function`. `null` is a
 * valid, distinct success value (a function may legitimately return no
 * body) and is preserved as `{ data: null }` — never coerced to `{}`.
 * Any other non-JSON-safe value (a `Blob`, a raw `Response`, a
 * `FormData`, etc. — see the executor for which response shapes can
 * reach here) throws `InvalidStepExecutionOutputError`.
 */
export function buildInvokeFunctionStepOutput(
  identity: {
    stepId: string;
    stepKey: string;
    stepType: 'invoke_function';
  },
  rawData: unknown,
): { data: JsonValue } {
  if (!isJsonSafeValue(rawData)) {
    throw new InvalidStepExecutionOutputError({
      ...identity,
      reason: 'not-json-safe',
    });
  }
  return { data: rawData };
}
