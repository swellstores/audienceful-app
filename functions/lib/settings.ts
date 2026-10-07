export interface AudiencefulSettings {
  apiKey: string;
  syncCustomers: boolean;
  /** Also sync customers who didn't opt in to marketing. Off unless the merchant turns it on. */
  includeWithoutConsent: boolean;
  sendOrders: boolean;
  orderEvent: string;
}

export const DEFAULT_ORDER_EVENT = 'order_placed';

interface RawSettings {
  audienceful?: {
    api_key?: string;
    sync_customers?: boolean;
    include_without_consent?: boolean;
    send_orders?: boolean;
    order_event?: string;
  };
}

/** The merchant's settings. Unsaved toggles count as their defaults. */
export async function readSettings(swell: SwellAPI): Promise<AudiencefulSettings> {
  const raw = ((await swell.settings()) ?? {}) as RawSettings;
  const settings = raw.audienceful ?? {};
  return {
    apiKey: settings.api_key?.trim() ?? '',
    syncCustomers: settings.sync_customers !== false,
    includeWithoutConsent: settings.include_without_consent === true,
    sendOrders: settings.send_orders !== false,
    orderEvent: settings.order_event?.trim() || DEFAULT_ORDER_EVENT,
  };
}

/** Whether a customer may be sent to Audienceful under the merchant's consent setting. */
export function maySync(settings: AudiencefulSettings, emailOptin: boolean | undefined): boolean {
  return Boolean(emailOptin) || settings.includeWithoutConsent;
}
