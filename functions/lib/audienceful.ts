export const API_URL = 'https://api.audienceful.com/v2';

/** Longest wait for a rate limit inside a function. Functions time out after 10 seconds. */
const MAX_INLINE_WAIT_MS = 2000;
const MAX_ATTEMPTS = 3;

/** An error answer from the Audienceful API, with its status and error envelope. */
export class AudiencefulError extends Error {
  status: number;
  type: string;
  code: string;
  /** Seconds to wait before retrying, from Retry-After (rate limits only). */
  retryAfter?: number;

  constructor(status: number, type: string, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'AudiencefulError';
    this.status = status;
    this.type = type;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface Contact {
  email: string;
  phone_number?: string;
  tags?: string[];
  extra_data?: Record<string, string | number | boolean | null>;
}

export interface Field {
  id: string;
  name: string;
  data_name: string;
  type: string;
}

export interface FieldInput {
  name: string;
  data_name: string;
  type: 'string' | 'boolean' | 'number' | 'datetime';
}

interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A small client for the Audienceful API v2 (https://www.audienceful.com/help/api). */
export class AudiencefulClient {
  constructor(private apiKey: string) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) {
        return (res.status === 204 ? undefined : await res.json()) as T;
      }

      const error = await toError(res);
      // Short rate-limit waits are retried here; longer ones are left to the caller.
      const waitMs = (error.retryAfter ?? 1) * 1000;
      if (error.status === 429 && attempt < MAX_ATTEMPTS && waitMs <= MAX_INLINE_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }

  /** Creates the contact, or updates it when the email is already on file. Tags are only ever added. */
  upsertContact(contact: Contact) {
    return this.request<{ id: string }>('POST', '/people', contact);
  }

  /** Marks the contact unsubscribed. A contact Audienceful doesn't have is not an error. */
  async unsubscribe(email: string): Promise<void> {
    try {
      await this.request('POST', '/people/unsubscribe', { email });
    } catch (error) {
      if (error instanceof AudiencefulError && error.status === 404) return;
      throw error;
    }
  }

  async listFields(): Promise<Field[]> {
    const fields: Field[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const page: Page<Field> = await this.request('GET', `/fields${query}`);
      fields.push(...page.data);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return fields;
  }

  createField(field: FieldInput) {
    return this.request<Field>('POST', '/fields', field);
  }
}

async function toError(res: Response): Promise<AudiencefulError> {
  let type = 'api_error';
  let code = '';
  let message = `Audienceful answered ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: { type?: string; code?: string; message?: string } };
    type = body.error?.type ?? type;
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // Not JSON: keep the generic message.
  }
  const retryAfter = Number(res.headers.get('Retry-After'));
  return new AudiencefulError(res.status, type, code, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
}
