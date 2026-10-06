export interface AudiencefulSettings {
  apiKey: string;
  syncCustomers: boolean;
  /** Also sync customers who didn't opt in to marketing. Off unless the merchant turns it on. */
  includeWithoutConsent: boolean;
}

interface RawSettings {
  audienceful?: { api_key?: string; sync_customers?: boolean; include_without_consent?: boolean };
}

/** The merchant's settings. Unsaved toggles count as their defaults. */
export async function readSettings(swell: SwellAPI): Promise<AudiencefulSettings> {
  const raw = ((await swell.settings()) ?? {}) as RawSettings;
  const settings = raw.audienceful ?? {};
  return {
    apiKey: settings.api_key?.trim() ?? '',
    syncCustomers: settings.sync_customers !== false,
    includeWithoutConsent: settings.include_without_consent === true,
  };
}
