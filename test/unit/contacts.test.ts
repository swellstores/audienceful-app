import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_FIELDS, CONSENT_TAG, CUSTOMER_TAG, contactFromAccount, ensureFields, resetFieldCache } from '../../functions/lib/contacts';
import type { AudiencefulClient } from '../../functions/lib/audienceful';

afterEach(() => resetFieldCache());

describe('contactFromAccount', () => {
  it('maps a full account', () => {
    expect(
      contactFromAccount({
        id: 'a1',
        email: ' Ana@Example.com ',
        email_optin: true,
        first_name: 'Ana',
        last_name: 'Silva',
        phone: ' +351 912 345 678 ',
        order_count: 3,
        order_value: 129.5,
        shipping: { address1: 'Rua 1', address2: '2º', city: 'Lisboa', state: 'Lisboa', zip: '1000-001' },
      }),
    ).toEqual({
      email: 'ana@example.com',
      phone_number: '+351 912 345 678',
      tags: [CUSTOMER_TAG, CONSENT_TAG],
      extra_data: {
        first_name: 'Ana',
        last_name: 'Silva',
        address_line_1: 'Rua 1',
        address_line_2: '2º',
        city: 'Lisboa',
        state: 'Lisboa',
        postal_code: '1000-001',
        swell_order_count: 3,
        swell_total_spent: 129.5,
      },
    });
  });

  it('leaves out empty values and uses the billing address when there is no shipping address', () => {
    const contact = contactFromAccount({
      id: 'a1',
      email: 'b@example.com',
      first_name: '',
      shipping: {},
      billing: { city: 'Porto', zip: '4000' },
    });

    expect(contact).toEqual({
      email: 'b@example.com',
      tags: [CUSTOMER_TAG],
      extra_data: { city: 'Porto', postal_code: '4000', swell_order_count: 0, swell_total_spent: 0 },
    });
  });
});

describe('ensureFields', () => {
  function client(existing: string[]) {
    return {
      listFields: vi.fn().mockResolvedValue(existing.map((data_name) => ({ id: data_name, name: data_name, data_name, type: 'number' }))),
      createField: vi.fn().mockResolvedValue({}),
    };
  }

  it('creates the missing fields only', async () => {
    const c = client(['first_name', 'swell_order_count']);
    await ensureFields(c as unknown as AudiencefulClient, 'key');

    expect(c.createField).toHaveBeenCalledTimes(1);
    expect(c.createField).toHaveBeenCalledWith(APP_FIELDS.find((f) => f.data_name === 'swell_total_spent'));
  });

  it('checks once per API key', async () => {
    const c = client(['swell_order_count', 'swell_total_spent']);
    await ensureFields(c as unknown as AudiencefulClient, 'key');
    await ensureFields(c as unknown as AudiencefulClient, 'key');
    await ensureFields(c as unknown as AudiencefulClient, 'other-key');

    expect(c.listFields).toHaveBeenCalledTimes(2);
    expect(c.createField).not.toHaveBeenCalled();
  });

  it('checks again after a failure', async () => {
    const c = client([]);
    c.createField.mockRejectedValueOnce(new Error('boom'));
    await expect(ensureFields(c as unknown as AudiencefulClient, 'key')).rejects.toThrow('boom');
    await ensureFields(c as unknown as AudiencefulClient, 'key');

    expect(c.listFields).toHaveBeenCalledTimes(2);
  });
});
