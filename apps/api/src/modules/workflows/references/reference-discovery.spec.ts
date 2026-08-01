import { describe, expect, it } from '@jest/globals';
import type { JsonValue } from '@supabase-heartbeat/validation';
import { discoverStepOutputReferences } from './reference-discovery';

describe('discoverStepOutputReferences', () => {
  it('discovers a reference at the root', () => {
    const configuration: JsonValue = '${steps.a.output.id}';

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toEqual([
      {
        configurationPath: [],
        reference: { stepKey: 'a', path: ['id'] },
      },
    ]);
    expect(result.malformed).toEqual([]);
  });

  it('discovers a reference nested inside an object', () => {
    const configuration: JsonValue = {
      filter: { value: '${steps.a.output.id}' },
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toEqual([
      {
        configurationPath: ['filter', 'value'],
        reference: { stepKey: 'a', path: ['id'] },
      },
    ]);
  });

  it('discovers a reference inside an array', () => {
    const configuration: JsonValue = {
      relatedIds: ['${steps.a.output.id}'],
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toEqual([
      {
        configurationPath: ['relatedIds', 0],
        reference: { stepKey: 'a', path: ['id'] },
      },
    ]);
  });

  it('discovers references inside a nested array/object combination', () => {
    const configuration: JsonValue = {
      table: 'audit_logs',
      values: {
        recordId: '${steps.create_record.output.rows.0.id}',
        metadata: {
          functionStatus: '${steps.health_check.output.data.status}',
        },
        relatedIds: [
          '${steps.first_insert.output.rows.0.id}',
          '${steps.second_insert.output.rows.0.id}',
        ],
      },
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toHaveLength(4);
    expect(result.references).toEqual(
      expect.arrayContaining([
        {
          configurationPath: ['values', 'recordId'],
          reference: {
            stepKey: 'create_record',
            path: ['rows', 0, 'id'],
          },
        },
        {
          configurationPath: ['values', 'metadata', 'functionStatus'],
          reference: { stepKey: 'health_check', path: ['data', 'status'] },
        },
        {
          configurationPath: ['values', 'relatedIds', 0],
          reference: { stepKey: 'first_insert', path: ['rows', 0, 'id'] },
        },
        {
          configurationPath: ['values', 'relatedIds', 1],
          reference: { stepKey: 'second_insert', path: ['rows', 0, 'id'] },
        },
      ]),
    );
  });

  it('reports multiple references found in the same configuration', () => {
    const configuration: JsonValue = {
      a: '${steps.first.output.id}',
      b: '${steps.second.output.id}',
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toHaveLength(2);
  });

  it('ignores non-reference strings', () => {
    const configuration: JsonValue = { table: 'profiles', name: 'ordinary' };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('detects partial interpolation as malformed, not a reference', () => {
    const configuration: JsonValue = {
      message: 'Created ${steps.a.output.id} today',
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references).toEqual([]);
    expect(result.malformed).toEqual([{ configurationPath: ['message'] }]);
  });

  it('never mutates the source configuration', () => {
    const configuration: JsonValue = {
      values: { id: '${steps.a.output.id}' },
    };
    const clone = JSON.parse(JSON.stringify(configuration)) as JsonValue;

    discoverStepOutputReferences(configuration);

    expect(configuration).toEqual(clone);
  });

  it('reports correct configuration paths for deeply nested references', () => {
    const configuration: JsonValue = {
      a: { b: { c: ['${steps.x.output.y}'] } },
    };

    const result = discoverStepOutputReferences(configuration);

    expect(result.references[0]?.configurationPath).toEqual(['a', 'b', 'c', 0]);
  });
});
