import { AudiencefulClient } from './lib/audienceful';
import { ACCOUNT_FIELDS, contactFromAccount, ensureFields, type SwellAccount } from './lib/contacts';
import { BUYER_TAG, ORDER_FIELDS, orderProperties, type SwellOrder } from './lib/orders';
import { maySync, readSettings } from './lib/settings';

export const config: SwellConfig = {
  description: 'Send placed orders to Audienceful as the order event',
  model: {
    events: ['order.submitted'],
  },
};

/**
 * When an order is placed, updates the customer's contact (tagged swell-buyer, with their totals) and
 * fires the merchant's order event, which starts their post-purchase automations. The customer must
 * be allowed under the consent setting. A missing event in Audienceful skips the event, not the contact.
 */
export default async function (req: SwellRequest) {
  const { swell } = req;
  const orderId = (req.data as { id?: string }).id;
  const settings = await readSettings(swell);
  if (!settings.apiKey || !settings.sendOrders || !orderId) return;

  const order = (await swell.get(`/orders/${orderId}`, { fields: ORDER_FIELDS })) as SwellOrder | null;
  if (!order?.account_id) return;
  const account = (await swell.get(`/accounts/${order.account_id}`, { fields: ACCOUNT_FIELDS })) as SwellAccount | null;
  if (!account?.email || !maySync(settings, account.email_optin)) return;

  const client = new AudiencefulClient(settings.apiKey);
  const contact = contactFromAccount(account, [BUYER_TAG]);
  await ensureFields(client, settings.apiKey);
  await client.upsertContact(contact);

  const fired = await client.triggerEvent({
    email: contact.email,
    event: settings.orderEvent,
    event_properties: orderProperties(order),
  });
  if (!fired) {
    console.warn(`Audienceful has no "${settings.orderEvent}" event. Create it under Settings → Events. Order ${order.number} was not sent as an event.`);
  }
}
