import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest } from '../helpers/mock-request';
import handler from '../../functions/cart-events';
import { API_URL } from '../../functions/lib/audienceful';
import { cartProperties } from '../../functions/lib/carts';
import { resetFieldCache } from '../../functions/lib/contacts';

const CART = {
  id: 'cart1',
  account_id: 'acc1',
  checkout_url: 'https://shop.example.com/checkout/abc',
  currency: 'EUR',
  grand_total: 30,
  sub_total: 30,
  items: [{ product_name: 'Mug', quantity: 2 }],
};
const ACCOUNT = { id: 'acc1', email: 'ana@example.com', email_optin: true, first_name: 'Ana' };

function swellMock({
  cart = CART as Record<string, unknown> | null,
  account = ACCOUNT as Record<string, unknown> | null,
  settings = { api_key: 'key' } as Record<string, unknown>,
} = {}) {
  return {
    settings: vi.fn().mockResolvedValue({ audienceful: settings }),
    get: vi.fn(async (url: string) => (url.startsWith('/carts/') ? cart : account)),
  };
}

function audienceful(eventStatus = 202) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith(`${API_URL}/fields`)) {
      return new Response(JSON.stringify({ data: [{ data_name: 'swell_order_count' }, { data_name: 'swell_total_spent' }], has_more: false }));
    }
    if (url === `${API_URL}/automations/event`) {
      return eventStatus === 202
        ? new Response(JSON.stringify({ status: 'pending' }), { status: 202 })
        : new Response(JSON.stringify({ error: { type: 'not_found_error', message: 'Event not found' } }), { status: eventStatus });
    }
    return new Response(JSON.stringify({ id: 'p1' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof audienceful>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    path: url.replace(API_URL, ''),
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  }));
}

async function run(swell: ReturnType<typeof swellMock>) {
  await handler(createMockRequest({ swell: swell as unknown as SwellAPI, data: { id: 'cart1' } as unknown as SwellData }));
}

beforeEach(() => resetFieldCache());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cartProperties', () => {
  it('describes the cart with a link back to checkout', () => {
    expect(cartProperties({ ...CART, discount_total: 5 })).toEqual({
      checkout_url: 'https://shop.example.com/checkout/abc',
      cart_total: '30.00 EUR',
      cart_subtotal: '30.00 EUR',
      discount_total: '5.00 EUR',
      currency: 'EUR',
      item_count: 2,
      items: '2 × Mug',
      first_item_name: 'Mug',
    });
  });
});

describe('cart-events', () => {
  it('updates the shopper and fires the cart event', async () => {
    const fetchMock = audienceful();
    await run(swellMock());

    const sent = calls(fetchMock);
    expect(sent.map((c) => c.path)).toEqual(['/fields', '/people', '/automations/event']);
    expect(sent[1].body.tags).toEqual(['swell-customer', 'marketing-consent']);
    expect(sent[2].body).toMatchObject({
      email: 'ana@example.com',
      event: 'cart_abandoned',
      event_properties: { checkout_url: 'https://shop.example.com/checkout/abc', cart_total: '30.00 EUR', items: '2 × Mug' },
    });
  });

  it("uses the merchant's event name", async () => {
    const fetchMock = audienceful();
    await run(swellMock({ settings: { api_key: 'key', cart_event: 'left_cart' } }));
    expect(calls(fetchMock)[2].body.event).toBe('left_cart');
  });

  it('warns when the event does not exist in Audienceful', async () => {
    audienceful(404);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run(swellMock());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no "cart_abandoned" event'));
  });

  it('skips shoppers who did not opt in, unless the merchant includes everyone', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ account: { ...ACCOUNT, email_optin: false } }));
    expect(fetchMock).not.toHaveBeenCalled();

    await run(swellMock({ account: { ...ACCOUNT, email_optin: false }, settings: { api_key: 'key', include_without_consent: true } }));
    expect(calls(fetchMock).map((c) => c.path)).toContain('/automations/event');
  });

  it('skips carts without a shopper, an email or items', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ cart: { ...CART, account_id: undefined } }));
    await run(swellMock({ cart: { ...CART, items: [] } }));
    await run(swellMock({ account: { ...ACCOUNT, email: undefined } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when abandoned carts are turned off', async () => {
    const fetchMock = audienceful();
    const swell = swellMock({ settings: { api_key: 'key', send_carts: false } });
    await run(swell);
    expect(swell.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
