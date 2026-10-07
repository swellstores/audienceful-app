import { AudiencefulClient } from './lib/audienceful';
import { CART_FIELDS, cartProperties, type SwellCart } from './lib/carts';
import { ACCOUNT_FIELDS, contactFromAccount, ensureFields, type SwellAccount } from './lib/contacts';
import { maySync, readSettings } from './lib/settings';

export const config: SwellConfig = {
  description: 'Send abandoned carts to Audienceful as the cart event',
  model: {
    events: ['cart.abandoned'],
  },
};

/**
 * Swell marks a cart abandoned after 3 hours without activity. This updates the shopper's contact and
 * fires the merchant's cart event with the items and a checkout link, which starts their cart
 * recovery automations. Carts without a known shopper email can't be followed up.
 */
export default async function (req: SwellRequest) {
  const { swell } = req;
  const cartId = (req.data as { id?: string }).id;
  const settings = await readSettings(swell);
  if (!settings.apiKey || !settings.sendCarts || !cartId) return;

  const cart = (await swell.get(`/carts/${cartId}`, { fields: CART_FIELDS })) as SwellCart | null;
  if (!cart?.account_id || !cart.items?.length) return;
  const account = (await swell.get(`/accounts/${cart.account_id}`, { fields: ACCOUNT_FIELDS })) as SwellAccount | null;
  if (!account?.email || !maySync(settings, account.email_optin)) return;

  const client = new AudiencefulClient(settings.apiKey);
  const contact = contactFromAccount(account);
  await ensureFields(client, settings.apiKey);
  await client.upsertContact(contact);

  const fired = await client.triggerEvent({
    email: contact.email,
    event: settings.cartEvent,
    event_properties: cartProperties(cart),
  });
  if (!fired) {
    console.warn(`Audienceful has no "${settings.cartEvent}" event. Create it under Settings → Events. Cart ${cartId} was not sent as an event.`);
  }
}
