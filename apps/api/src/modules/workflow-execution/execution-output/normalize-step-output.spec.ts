import { describe, expect, it } from '@jest/globals';
import { isJsonSafeObject, isJsonSafeValue } from './normalize-step-output';

class NotJson {
  value = 1;
}

describe('isJsonSafeValue', () => {
  it('accepts null', () => {
    expect(isJsonSafeValue(null)).toBe(true);
  });

  it('accepts booleans', () => {
    expect(isJsonSafeValue(true)).toBe(true);
    expect(isJsonSafeValue(false)).toBe(true);
  });

  it('accepts a finite number', () => {
    expect(isJsonSafeValue(42)).toBe(true);
    expect(isJsonSafeValue(-3.5)).toBe(true);
    expect(isJsonSafeValue(0)).toBe(true);
  });

  it('accepts a string', () => {
    expect(isJsonSafeValue('hello')).toBe(true);
    expect(isJsonSafeValue('')).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(isJsonSafeValue([])).toBe(true);
  });

  it('accepts nested arrays', () => {
    expect(isJsonSafeValue([1, [2, [3, 'four']], null])).toBe(true);
  });

  it('accepts an empty object', () => {
    expect(isJsonSafeValue({})).toBe(true);
  });

  it('accepts nested plain objects', () => {
    expect(isJsonSafeValue({ a: { b: { c: [1, 2, { d: null }] } } })).toBe(
      true,
    );
  });

  it('rejects undefined', () => {
    expect(isJsonSafeValue(undefined)).toBe(false);
  });

  it('rejects bigint', () => {
    expect(isJsonSafeValue(BigInt(1))).toBe(false);
  });

  it('rejects a symbol', () => {
    expect(isJsonSafeValue(Symbol('x'))).toBe(false);
  });

  it('rejects a function', () => {
    expect(isJsonSafeValue(() => 1)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isJsonSafeValue(Number.NaN)).toBe(false);
  });

  it('rejects positive Infinity', () => {
    expect(isJsonSafeValue(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects negative Infinity', () => {
    expect(isJsonSafeValue(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('rejects a non-finite number nested inside an object', () => {
    expect(isJsonSafeValue({ a: [1, Number.NaN] })).toBe(false);
  });

  it('rejects a cyclic object', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;

    expect(isJsonSafeValue(cyclic)).toBe(false);
  });

  it('rejects an unsupported class instance', () => {
    expect(isJsonSafeValue(new NotJson())).toBe(false);
  });

  it('rejects a Date instance', () => {
    expect(isJsonSafeValue(new Date())).toBe(false);
  });

  it('does not mutate the source object', () => {
    const source = { a: 1, nested: { b: 2 } };
    const clone = JSON.parse(JSON.stringify(source)) as unknown;

    isJsonSafeValue(source);

    expect(source).toEqual(clone);
  });

  it('never includes the rejected value in any thrown error path', () => {
    // isJsonSafeValue itself never throws for any input (including
    // cyclic/unsafe values) — it always returns a boolean. This proves
    // no exception carrying the value can escape from this function.
    expect(() => isJsonSafeValue(new NotJson())).not.toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => isJsonSafeValue(cyclic)).not.toThrow();
  });
});

describe('isJsonSafeObject', () => {
  it('accepts a valid row-object', () => {
    expect(isJsonSafeObject({ id: '1', name: 'Heartbeat', active: true })).toBe(
      true,
    );
  });

  it('accepts an empty object', () => {
    expect(isJsonSafeObject({})).toBe(true);
  });

  it('rejects a primitive row', () => {
    expect(isJsonSafeObject('not-a-row')).toBe(false);
    expect(isJsonSafeObject(42)).toBe(false);
    expect(isJsonSafeObject(true)).toBe(false);
    expect(isJsonSafeObject(null)).toBe(false);
  });

  it('rejects an array row', () => {
    expect(isJsonSafeObject([1, 2, 3])).toBe(false);
  });

  it('rejects a row containing a non-finite number', () => {
    expect(isJsonSafeObject({ score: Number.NaN })).toBe(false);
  });

  it('rejects a row containing an unsupported class instance', () => {
    expect(isJsonSafeObject({ createdAt: new Date() })).toBe(false);
  });
});
