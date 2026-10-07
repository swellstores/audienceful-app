import { itemCount, itemLine, itemName, money, type SwellOrderItem } from './orders';

/** The cart fields the app reads. */
export const CART_FIELDS = 'account_id,checkout_url,currency,grand_total,sub_total,discount_total,items';

export interface SwellCart {
  id: string;
  account_id?: string;
  checkout_url?: string;
  currency?: string;
  grand_total?: number;
  sub_total?: number;
  discount_total?: number;
  items?: SwellOrderItem[];
}

/** Event properties for an abandoned cart, for use as data variables in Audienceful emails. */
export function cartProperties(cart: SwellCart): Record<string, string | number> {
  const items = cart.items ?? [];
  const currency = cart.currency ?? '';
  return {
    checkout_url: cart.checkout_url ?? '',
    cart_total: money(cart.grand_total, currency),
    cart_subtotal: money(cart.sub_total, currency),
    discount_total: money(cart.discount_total, currency),
    currency,
    item_count: itemCount(items),
    items: items.map(itemLine).join('\n'),
    first_item_name: items[0] ? itemName(items[0]) : '',
  };
}
