import type { AudiencefulClient, Contact, FieldInput } from './audienceful';

/** Tag on every contact the app sends, so merchants can build audiences from Swell customers. */
export const CUSTOMER_TAG = 'swell-customer';

/** Tag on customers who opted in to marketing, for merchants who also sync customers who didn't. */
export const CONSENT_TAG = 'marketing-consent';

/** Custom fields the app keeps up to date. Audienceful silently drops values for fields that don't exist. */
export const APP_FIELDS: FieldInput[] = [
  { name: 'Swell order count', data_name: 'swell_order_count', type: 'number' },
  { name: 'Swell total spent', data_name: 'swell_total_spent', type: 'number' },
];

/** The account fields the app reads. */
export const ACCOUNT_FIELDS = 'email,email_optin,first_name,last_name,phone,order_count,order_value,shipping,billing';

export interface SwellAddress {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface SwellAccount {
  id: string;
  email?: string;
  email_optin?: boolean;
  first_name?: string;
  last_name?: string;
  phone?: string;
  order_count?: number;
  order_value?: number;
  shipping?: SwellAddress;
  billing?: SwellAddress;
}

/** The Audienceful contact for a Swell account. Empty values are left out so they never wipe data. */
export function contactFromAccount(account: SwellAccount): Contact {
  const address = hasAddress(account.shipping) ? account.shipping : account.billing;
  const extra: Contact['extra_data'] = {
    first_name: account.first_name,
    last_name: account.last_name,
    address_line_1: address?.address1,
    address_line_2: address?.address2,
    city: address?.city,
    state: address?.state,
    postal_code: address?.zip,
    swell_order_count: account.order_count ?? 0,
    swell_total_spent: account.order_value ?? 0,
  };
  const contact: Contact = {
    email: (account.email ?? '').trim().toLowerCase(),
    tags: account.email_optin ? [CUSTOMER_TAG, CONSENT_TAG] : [CUSTOMER_TAG],
    extra_data: Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined && value !== null && value !== '')),
  };
  if (account.phone?.trim()) contact.phone_number = account.phone.trim();
  return contact;
}

function hasAddress(address?: SwellAddress): boolean {
  return Boolean(address && (address.address1 || address.city || address.zip));
}

// Field setup runs once per worker and API key, so a busy store doesn't list fields on every change.
const fieldsReady = new Set<string>();

/** Creates the app's custom fields in Audienceful when they're missing. */
export async function ensureFields(client: AudiencefulClient, apiKey: string): Promise<void> {
  if (fieldsReady.has(apiKey)) return;
  const existing = new Set((await client.listFields()).map((field) => field.data_name));
  for (const field of APP_FIELDS) {
    if (!existing.has(field.data_name)) await client.createField(field);
  }
  fieldsReady.add(apiKey);
}

/** For tests: forget which keys already have their fields. */
export function resetFieldCache() {
  fieldsReady.clear();
}
