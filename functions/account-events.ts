import { AudiencefulClient } from './lib/audienceful';
import { ACCOUNT_FIELDS, contactFromAccount, ensureFields, type SwellAccount } from './lib/contacts';
import { maySync, readSettings } from './lib/settings';

export const config: SwellConfig = {
  description: 'Send customers who opted in to marketing to Audienceful as contacts',
  model: {
    events: ['account.created', 'account.updated'],
  },
};

/** Account fields that change what Audienceful stores. Updates to anything else are skipped. */
const WATCHED = ACCOUNT_FIELDS.split(',');

type EventData = SwellData & { id?: string; $event?: { type?: string; data?: Record<string, unknown> } };

/**
 * Keeps Audienceful in step with Swell customers. By default only customers who agreed to marketing
 * emails (email_optin) are sent; the merchant can include everyone. A customer who withdraws consent
 * is unsubscribed in Audienceful either way.
 */
export default async function (req: SwellRequest) {
  const { swell } = req;
  const data = req.data as EventData;
  const settings = await readSettings(swell);
  if (!settings.apiKey || !settings.syncCustomers) return;

  const changed = data.$event?.data ?? {};
  const isUpdate = data.$event?.type === 'account.updated';
  if (isUpdate && !WATCHED.some((field) => field in changed)) return;

  const accountId = data.id ?? (changed.id as string | undefined);
  if (!accountId) return;
  const account = (await swell.get(`/accounts/${accountId}`, { fields: ACCOUNT_FIELDS })) as SwellAccount | null;
  if (!account?.email) return;

  const client = new AudiencefulClient(settings.apiKey);
  if (isUpdate && 'email_optin' in changed && !account.email_optin) {
    // Consent withdrawn in Swell: stop marketing emails in Audienceful too.
    await client.unsubscribe(account.email.trim().toLowerCase());
  } else if (maySync(settings, account.email_optin)) {
    await ensureFields(client, settings.apiKey);
    await client.upsertContact(contactFromAccount(account));
  }
}
