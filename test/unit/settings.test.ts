import { describe, expect, it, vi } from 'vitest';
import { readSettings } from '../../functions/lib/settings';

function swell(settings: unknown) {
  return { settings: vi.fn().mockResolvedValue(settings) } as unknown as SwellAPI;
}

describe('readSettings', () => {
  it('reads and trims the API key', async () => {
    await expect(readSettings(swell({ audienceful: { api_key: '  abc  ', sync_customers: true } }))).resolves.toEqual({
      apiKey: 'abc',
      syncCustomers: true,
      includeWithoutConsent: false,
    });
  });

  it('treats unsaved toggles as on and a missing key as empty', async () => {
    await expect(readSettings(swell({}))).resolves.toEqual({ apiKey: '', syncCustomers: true, includeWithoutConsent: false });
    await expect(readSettings(swell(null))).resolves.toEqual({ apiKey: '', syncCustomers: true, includeWithoutConsent: false });
  });

  it('includes customers without consent only when turned on', async () => {
    await expect(readSettings(swell({ audienceful: { include_without_consent: true } }))).resolves.toMatchObject({ includeWithoutConsent: true });
  });

  it('respects a toggle turned off', async () => {
    await expect(readSettings(swell({ audienceful: { sync_customers: false } }))).resolves.toMatchObject({ syncCustomers: false });
  });
});
