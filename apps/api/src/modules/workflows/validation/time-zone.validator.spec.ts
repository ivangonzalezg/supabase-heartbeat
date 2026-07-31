import { validate } from 'class-validator';
import { IsIanaTimeZone } from './time-zone.validator';

class TestDto {
  @IsIanaTimeZone()
  timezone!: string;
}

async function validateValue(value: string): Promise<boolean> {
  const dto = new TestDto();
  dto.timezone = value;
  const errors = await validate(dto);
  return errors.length === 0;
}

describe('IsIanaTimeZone', () => {
  it.each([
    'UTC',
    'America/Bogota',
    'America/New_York',
    'Europe/Madrid',
    'Asia/Tokyo',
  ])('accepts %s', async (value) => {
    expect(await validateValue(value)).toBe(true);
  });

  it.each(['Bogota', 'EST', 'UTC-5', 'Invalid/Zone', 'GMT', 'utc', ''])(
    'rejects %s',
    async (value) => {
      expect(await validateValue(value)).toBe(false);
    },
  );

  it('rejects a non-string value', async () => {
    const dto = new TestDto();
    // @ts-expect-error deliberately invalid for the untyped-input test
    dto.timezone = 42;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
