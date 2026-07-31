import { describe, expect, it } from 'vitest';
import {
  jsonObjectSchema,
  jsonValueSchema,
  safeParseJsonObject,
  safeParseJsonValue,
} from './json-value.js';

describe('jsonValueSchema', () => {
  it.each([
    'a string',
    '',
    0,
    1.5,
    -3,
    true,
    false,
    null,
    [],
    [1, 'two', false, null],
    {},
    { a: 1, b: 'two', c: [1, 2, 3], d: { nested: true } },
  ])('accepts %j', (value) => {
    expect(jsonValueSchema.safeParse(value).success).toBe(true);
  });

  it('rejects undefined', () => {
    expect(jsonValueSchema.safeParse(undefined).success).toBe(false);
  });

  it('rejects a function', () => {
    expect(jsonValueSchema.safeParse(() => 'x').success).toBe(false);
  });

  it('rejects a symbol', () => {
    expect(jsonValueSchema.safeParse(Symbol('x')).success).toBe(false);
  });

  it('rejects a class instance', () => {
    class Custom {
      value = 1;
    }
    expect(jsonValueSchema.safeParse(new Custom()).success).toBe(false);
  });

  it('rejects a Date instance', () => {
    expect(jsonValueSchema.safeParse(new Date()).success).toBe(false);
  });

  it('rejects a Map', () => {
    expect(jsonValueSchema.safeParse(new Map()).success).toBe(false);
  });

  it('accepts deeply nested arrays and objects (recursion)', () => {
    const deeplyNested = {
      level1: {
        level2: {
          level3: [1, 2, { level4: ['a', 'b', { level5: true }] }],
        },
      },
    };
    expect(jsonValueSchema.safeParse(deeplyNested).success).toBe(true);
  });

  it('rejects an object containing a function at any depth', () => {
    const withFunctionDeep = { a: { b: [1, 2, { c: () => 'x' }] } };
    expect(jsonValueSchema.safeParse(withFunctionDeep).success).toBe(false);
  });
});

describe('safeParseJsonValue (cyclic-structure guard)', () => {
  it('rejects a self-referencing object rather than throwing', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;

    const result = safeParseJsonValue(cyclic);

    expect(result.success).toBe(false);
  });

  it('still accepts a normal, non-cyclic value', () => {
    const result = safeParseJsonValue({ a: 1, b: [1, 2, 3] });

    expect(result.success).toBe(true);
  });
});

describe('jsonObjectSchema', () => {
  it('accepts a plain object', () => {
    expect(jsonObjectSchema.safeParse({ a: 1, b: 'two' }).success).toBe(true);
  });

  it('accepts an empty object', () => {
    expect(jsonObjectSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an array at the root', () => {
    expect(jsonObjectSchema.safeParse([1, 2, 3]).success).toBe(false);
  });

  it('rejects a primitive at the root', () => {
    expect(jsonObjectSchema.safeParse('a string').success).toBe(false);
    expect(jsonObjectSchema.safeParse(42).success).toBe(false);
    expect(jsonObjectSchema.safeParse(null).success).toBe(false);
  });
});

describe('safeParseJsonObject (cyclic-structure guard)', () => {
  it('rejects a self-referencing object rather than throwing', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;

    const result = safeParseJsonObject(cyclic);

    expect(result.success).toBe(false);
  });
});
