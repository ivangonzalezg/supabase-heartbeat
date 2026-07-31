import { validate } from 'class-validator';
import { IsCronExpression } from './cron-expression.validator';

class TestDto {
  @IsCronExpression()
  cronExpression!: string;
}

async function validateValue(value: string): Promise<boolean> {
  const dto = new TestDto();
  dto.cronExpression = value;
  const errors = await validate(dto);
  return errors.length === 0;
}

describe('IsCronExpression', () => {
  it.each([
    '0 */6 * * *',
    '0 0 */6 * * *',
    '* * * * *',
    '* * * * * *',
    '*/5 * * * *',
    '0 9-17 * * 1-5',
    '@daily',
    '@hourly',
  ])('accepts %s', async (value) => {
    expect(await validateValue(value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'not a cron',
    '0 */6 * * * extra',
    '60 * * * *',
    '0 0 32 * *',
    '0 0 * 13 *',
    '0 0 * * 8',
  ])('rejects %s', async (value) => {
    expect(await validateValue(value)).toBe(false);
  });

  it('rejects a non-string value', async () => {
    const dto = new TestDto();
    // @ts-expect-error deliberately invalid for the untyped-input test
    dto.cronExpression = 123;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
