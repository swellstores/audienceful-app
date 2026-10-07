import { describe, expect, it, vi } from 'vitest';
import { maySync, readSettings, type AudiencefulSettings } from '../../functions/lib/settings';

function swell(settings: unknown) {
  return { settings: vi.fn().mockResolvedValue(settings) } as unknown as SwellAPI;
}

const DEFAULTS: AudiencefulSettings = {
  apiKey: '',
  syncCustomers: true,
  includeWithoutConsent: false,
  sendOrders: true,
  orderEvent: 'order_placed',
};

describe('readSettings', () => {
  it('reads and trims the API key and event name', async () => {
    await expect(
      readSettings(swell({ audienceful: { api_key: '  abc  ', sync_customers: true, order_event: ' bought ' } })),
    ).resolves.toEqual({ ...DEFAULTS, apiKey: 'abc', orderEvent: 'bought' });
  });

  it('uses the defaults for unsaved settings', async () => {
    await expect(readSettings(swell({}))).resolves.toEqual(DEFAULTS);
    await expect(readSettings(swell(null))).resolves.toEqual(DEFAULTS);
    await expect(readSettings(swell({ audienceful: { order_event: '  ' } }))).resolves.toMatchObject({ orderEvent: 'order_placed' });
  });

  it('includes customers without consent only when turned on', async () => {
    await expect(readSettings(swell({ audienceful: { include_without_consent: true } }))).resolves.toMatchObject({ includeWithoutConsent: true });
  });

  it('respects toggles turned off', async () => {
    await expect(readSettings(swell({ audienceful: { sync_customers: false, send_orders: false } }))).resolves.toMatchObject({
      syncCustomers: false,
      sendOrders: false,
    });
  });
});

describe('maySync', () => {
  it('allows customers who opted in, and everyone when the merchant includes them', () => {
    expect(maySync(DEFAULTS, true)).toBe(true);
    expect(maySync(DEFAULTS, false)).toBe(false);
    expect(maySync(DEFAULTS, undefined)).toBe(false);
    expect(maySync({ ...DEFAULTS, includeWithoutConsent: true }, false)).toBe(true);
  });
});
