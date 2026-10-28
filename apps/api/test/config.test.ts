import { describe, expect, it } from 'vitest';

import { accessLimitsSchema, registrationConfig } from '../src/config.ts';

const parse = (env: Record<string, string>) => accessLimitsSchema.parse(env);
const SECRET = 'a-secret-of-sixteen-plus';

describe('registrationConfig', () => {
  it('is closed by default', () => {
    expect(registrationConfig(parse({}))).toBeUndefined();
  });

  it('opens with the defaults when switched on with a secret', () => {
    expect(
      registrationConfig(parse({ REGISTRATION_OPEN: 'true', REGISTRATION_SECRET: SECRET })),
    ).toEqual({ monthlyQuota: 200, perIpPerDay: 3, secret: SECRET });
  });

  it('stays closed without a secret, so IPs are never hashed with nothing', () => {
    expect(registrationConfig(parse({ REGISTRATION_OPEN: 'true' }))).toBeUndefined();
  });

  it('reads the quota and per-IP limit', () => {
    const config = parse({
      REGISTRATION_OPEN: 'true',
      REGISTRATION_SECRET: SECRET,
      REGISTRATION_QUOTA: '50',
      REGISTRATIONS_PER_IP_PER_DAY: '5',
    });
    expect(registrationConfig(config)).toMatchObject({ monthlyQuota: 50, perIpPerDay: 5 });
  });

  it('can be switched off again', () => {
    expect(
      registrationConfig(parse({ REGISTRATION_OPEN: 'false', REGISTRATION_SECRET: SECRET })),
    ).toBeUndefined();
  });
});
