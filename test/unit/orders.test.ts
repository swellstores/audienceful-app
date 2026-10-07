import { describe, expect, it } from 'vitest';
import { money, orderProperties } from '../../functions/lib/orders';

describe('orderProperties', () => {
  it('describes the order for email variables', () => {
    expect(
      orderProperties({
        id: 'o1',
        number: '100021',
        currency: 'EUR',
        grand_total: 52.5,
        sub_total: 50,
        discount_total: 5,
        shipment_total: 7.5,
        tax_total: 0,
        items: [
          { product_name: 'T-shirt', variant_name: 'Blue / M', quantity: 2, price_total: 40 },
          { product_name: 'Mug', quantity: 1, price_total: 10 },
        ],
      }),
    ).toEqual({
      order_number: '100021',
      order_total: '52.50 EUR',
      order_subtotal: '50.00 EUR',
      discount_total: '5.00 EUR',
      shipping_total: '7.50 EUR',
      tax_total: '0.00 EUR',
      currency: 'EUR',
      item_count: 3,
      items: '2 × T-shirt (Blue / M)\n1 × Mug',
      first_item_name: 'T-shirt (Blue / M)',
    });
  });

  it('copes with an order without items or totals', () => {
    expect(orderProperties({ id: 'o1' })).toEqual({
      order_number: '',
      order_total: '0.00',
      order_subtotal: '0.00',
      discount_total: '0.00',
      shipping_total: '0.00',
      tax_total: '0.00',
      currency: '',
      item_count: 0,
      items: '',
      first_item_name: '',
    });
  });
});

describe('money', () => {
  it('rounds to cents', () => {
    expect(money(10.005, 'USD')).toBe('10.01 USD');
    expect(money(0.1 + 0.2, 'USD')).toBe('0.30 USD');
  });
});
