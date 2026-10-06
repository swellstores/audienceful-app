import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_URL, AudiencefulClient, AudiencefulError } from '../../functions/lib/audienceful';

const KEY = 'test-key';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? json({}, 500));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AudiencefulClient.request', () => {
  it('sends the API key and a JSON body', async () => {
    const fetchMock = stubFetch(json({ id: 'p1' }, 201));
    const client = new AudiencefulClient(KEY);

    await expect(client.upsertContact({ email: 'a@example.com', tags: ['x'] })).resolves.toEqual({ id: 'p1' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_URL}/people`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe(KEY);
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@example.com', tags: ['x'] });
  });

  it('returns undefined for 204 No Content', async () => {
    stubFetch(json(null, 204));
    await expect(new AudiencefulClient(KEY).request('POST', '/people/delete', { email: 'a@example.com' })).resolves.toBeUndefined();
  });

  it('throws the error envelope', async () => {
    stubFetch(json({ error: { type: 'permission_error', code: 'permission_denied', message: 'Missing scope: people:write' } }, 403));
    const error = await new AudiencefulClient(KEY).request('GET', '/fields').catch((e) => e);

    expect(error).toBeInstanceOf(AudiencefulError);
    expect(error).toMatchObject({ status: 403, type: 'permission_error', code: 'permission_denied', message: 'Missing scope: people:write' });
  });

  it('keeps a generic message when the error body is not JSON', async () => {
    stubFetch(new Response('Bad gateway', { status: 502 }));
    await expect(new AudiencefulClient(KEY).request('GET', '/fields')).rejects.toMatchObject({ status: 502, message: 'Audienceful answered 502.' });
  });

  it('waits and retries a short rate limit', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(json({ error: { type: 'rate_limit_error' } }, 429, { 'Retry-After': '1' }), json({ data: [] }));
    const promise = new AudiencefulClient(KEY).request('GET', '/fields');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up on a long rate limit and reports when to retry', async () => {
    const fetchMock = stubFetch(json({ error: { type: 'rate_limit_error', message: 'Throttled' } }, 429, { 'Retry-After': '42' }));
    const error = await new AudiencefulClient(KEY).request('GET', '/fields').catch((e) => e);

    expect(error).toMatchObject({ status: 429, retryAfter: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AudiencefulClient helpers', () => {
  it('unsubscribe ignores a contact Audienceful does not have', async () => {
    stubFetch(json({ error: { type: 'not_found_error', message: 'Not found' } }, 404));
    await expect(new AudiencefulClient(KEY).unsubscribe('gone@example.com')).resolves.toBeUndefined();
  });

  it('unsubscribe passes other errors on', async () => {
    stubFetch(json({ error: { type: 'api_error' } }, 500));
    await expect(new AudiencefulClient(KEY).unsubscribe('a@example.com')).rejects.toMatchObject({ status: 500 });
  });

  it('listFields follows the cursor', async () => {
    const fetchMock = stubFetch(
      json({ data: [{ id: '1', data_name: 'first_name' }], has_more: true, next_cursor: 'c 2' }),
      json({ data: [{ id: '2', data_name: 'city' }], has_more: false, next_cursor: null }),
    );
    const fields = await new AudiencefulClient(KEY).listFields();

    expect(fields.map((f) => f.data_name)).toEqual(['first_name', 'city']);
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe(`${API_URL}/fields?cursor=c%202`);
  });
});
