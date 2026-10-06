import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest } from '../helpers/mock-request';
import handler from '../../functions/account-events';
import { API_URL } from '../../functions/lib/audienceful';
import { ACCOUNT_FIELDS, resetFieldCache } from '../../functions/lib/contacts';

const ACCOUNT = { id: 'acc1', email: 'ana@example.com', email_optin: true, first_name: 'Ana', order_count: 1, order_value: 20 };

function swellMock(account: Record<string, unknown> | null = ACCOUNT, settings: Record<string, unknown> = { api_key: 'key' }) {
  return {
    settings: vi.fn().mockResolvedValue({ audienceful: settings }),
    get: vi.fn().mockResolvedValue(account),
  };
}

/** Audienceful answers: the app's fields already exist, every write succeeds. */
function audienceful() {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith(`${API_URL}/fields`)) {
      return new Response(
        JSON.stringify({ data: [{ data_name: 'swell_order_count' }, { data_name: 'swell_total_spent' }], has_more: false, next_cursor: null }),
      );
    }
    return new Response(JSON.stringify({ id: 'p1' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof audienceful>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    path: (url as string).replace(API_URL, ''),
    body: (init as RequestInit)?.body ? JSON.parse((init as RequestInit).body as string) : undefined,
  }));
}

function event(type: string, changed: Record<string, unknown> = {}) {
  return { id: 'acc1', $event: { type, data: changed } } as unknown as SwellData;
}

async function run(swell: ReturnType<typeof swellMock>, data: SwellData) {
  await handler(createMockRequest({ swell: swell as unknown as SwellAPI, data }));
}

beforeEach(() => resetFieldCache());
afterEach(() => vi.unstubAllGlobals());

describe('account-events', () => {
  it('sends a new customer who opted in', async () => {
    const fetchMock = audienceful();
    const swell = swellMock();
    await run(swell, event('account.created', { id: 'acc1', email: 'ana@example.com' }));

    expect(swell.get).toHaveBeenCalledWith('/accounts/acc1', { fields: ACCOUNT_FIELDS });
    expect(calls(fetchMock)).toEqual([
      { path: '/fields', body: undefined },
      {
        path: '/people',
        body: {
          email: 'ana@example.com',
          tags: ['swell-customer', 'marketing-consent'],
          extra_data: { first_name: 'Ana', swell_order_count: 1, swell_total_spent: 20 },
        },
      },
    ]);
  });

  it('skips a customer who did not opt in', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ ...ACCOUNT, email_optin: false }), event('account.created'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a customer who did not opt in when the merchant includes everyone, without the consent tag', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ ...ACCOUNT, email_optin: false }, { api_key: 'key', include_without_consent: true }), event('account.created'));
    const people = calls(fetchMock).find((c) => c.path === '/people');
    expect(people?.body.tags).toEqual(['swell-customer']);
  });

  it('still unsubscribes a customer who withdraws consent when the merchant includes everyone', async () => {
    const fetchMock = audienceful();
    await run(
      swellMock({ ...ACCOUNT, email_optin: false }, { api_key: 'key', include_without_consent: true }),
      event('account.updated', { email_optin: false }),
    );
    expect(calls(fetchMock).map((c) => c.path)).toEqual(['/people/unsubscribe']);
  });

  it('unsubscribes a customer who withdraws consent', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ ...ACCOUNT, email: 'Ana@Example.com', email_optin: false }), event('account.updated', { email_optin: false }));
    expect(calls(fetchMock)).toEqual([{ path: '/people/unsubscribe', body: { email: 'ana@example.com' } }]);
  });

  it('updates the contact when a watched field changes', async () => {
    const fetchMock = audienceful();
    await run(swellMock(), event('account.updated', { order_count: 2 }));
    expect(calls(fetchMock).map((c) => c.path)).toEqual(['/fields', '/people']);
  });

  it('ignores updates to fields Audienceful does not store', async () => {
    const fetchMock = audienceful();
    const swell = swellMock();
    await run(swell, event('account.updated', { date_last_login: '2026-10-06' }));

    expect(swell.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without an API key', async () => {
    const fetchMock = audienceful();
    const swell = swellMock(ACCOUNT, {});
    await run(swell, event('account.created'));

    expect(swell.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when customer sync is off', async () => {
    const fetchMock = audienceful();
    await run(swellMock(ACCOUNT, { api_key: 'key', sync_customers: false }), event('account.created'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips accounts without an email', async () => {
    const fetchMock = audienceful();
    await run(swellMock({ id: 'acc1', email_optin: true }), event('account.created'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when Audienceful rejects the contact, so Swell records the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith(`${API_URL}/fields`)
          ? new Response(JSON.stringify({ data: [{ data_name: 'swell_order_count' }, { data_name: 'swell_total_spent' }], has_more: false }))
          : new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Bad email' } }), { status: 400 }),
      ),
    );
    await expect(run(swellMock(), event('account.created'))).rejects.toMatchObject({ status: 400, message: 'Bad email' });
  });
});
