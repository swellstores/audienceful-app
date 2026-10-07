import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest } from '../helpers/mock-request';
import handler from '../../functions/order-events';
import { API_URL } from '../../functions/lib/audienceful';
import { resetFieldCache } from '../../functions/lib/contacts';

const ORDER = { id: 'ord1', number: '100021', account_id: 'acc1', currency: 'EUR', grand_total: 20, items: [{ product_name: 'Mug', quantity: 1 }] };
const ACCOUNT = { id: 'acc1', email: 'ana@example.com', email_optin: true, first_name: 'Ana', order_count: 1, order_value: 20 };

function swellMock({
  order = ORDER as Record<string, unknown> | null,
  account = ACCOUNT as Record<string, unknown> | null,
  settings = { api_key: 'key' } as Record<string, unknown>,
} = {}) {
  return {
    settings: vi.fn().mockResolvedValue({ audienceful: settings }),
    get: vi.fn(async (url: string) => (url.startsWith('/orders/') ? order : account)),
  };
}

/** Audienceful: the app's fields exist; the event answers with `eventStatus`. */
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
  await handler(createMockRequest({ swell: swell as unknown as SwellAPI, data: { id: 'ord1' } as unknown as SwellData }));
}

beforeEach(() => resetFieldCache());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('order-events', () => {
  it('updates the buyer and fires the order event', async () => {
    const fetchMock = audienceful();
    await run(swellMock());

    const sent = calls(fetchMock);
    expect(sent.map((c) => c.path)).toEqual(['/fields', '/people', '/automations/event']);
    expect(sent[1].body.tags).toEqual(['swell-customer', 'marketing-consent', 'swell-buyer']);
    expect(sent[2].body).toMatchObject({
      email: 'ana@example.com',
      event: 'order_placed',
      add_person: false,
      event_properties: { order_number: '100021', order_total: '20.00 EUR', items: '1 × Mug', item_count: 1 },
    });
  });

  it("uses the merchant's event name", async () => {
    const fetchMock = audienceful();
    await run(swellMock({ settings: { api_key: 'key', order_event: 'purchased' } }));
    expect(calls(fetchMock)[2].body.event).toBe('purchased');
  });

  it('keeps the contact update and warns when the event does not exist in Audienceful', async () => {
    const fetchMock = audienceful(404);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run(swellMock());

    expect(calls(fetchMock).map((c) => c.path)).toEqual(['/fields', '/people', '/automations/event']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no "order_placed" event'));
  });

  it('skips a buyer who did not opt in', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ account: { ...ACCOUNT, email_optin: false } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a buyer who did not opt in when the merchant includes everyone', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ account: { ...ACCOUNT, email_optin: false }, settings: { api_key: 'key', include_without_consent: true } }));
    expect(calls(fetchMock)[1].body.tags).toEqual(['swell-customer', 'swell-buyer']);
  });

  it('does nothing when orders are turned off or there is no key', async () => {
    const fetchMock = audienceful();
    const off = swellMock({ settings: { api_key: 'key', send_orders: false } });
    await run(off);
    await run(swellMock({ settings: {} }));

    expect(off.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips orders without a customer email', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ order: { ...ORDER, account_id: undefined } }));
    await run(swellMock({ account: { ...ACCOUNT, email: undefined } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails on other Audienceful errors, so Swell records them', async () => {
    audienceful(500);
    await expect(run(swellMock())).rejects.toMatchObject({ status: 500 });
  });
});
