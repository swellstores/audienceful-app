/** Tag on contacts who placed at least one order. */
export const BUYER_TAG = 'swell-buyer';

/** The order fields the app reads. */
export const ORDER_FIELDS = 'number,account_id,currency,grand_total,sub_total,discount_total,shipment_total,tax_total,items';

export interface SwellOrderItem {
  product_name?: string;
  variant_name?: string;
  quantity?: number;
  price_total?: number;
}

export interface SwellOrder {
  id: string;
  number?: string;
  account_id?: string;
  currency?: string;
  grand_total?: number;
  sub_total?: number;
  discount_total?: number;
  shipment_total?: number;
  tax_total?: number;
  items?: SwellOrderItem[];
}

/** Event properties for an order, for use as data variables in Audienceful emails. */
export function orderProperties(order: SwellOrder): Record<string, string | number> {
  const items = order.items ?? [];
  const currency = order.currency ?? '';
  return {
    order_number: order.number ?? '',
    order_total: money(order.grand_total, currency),
    order_subtotal: money(order.sub_total, currency),
    discount_total: money(order.discount_total, currency),
    shipping_total: money(order.shipment_total, currency),
    tax_total: money(order.tax_total, currency),
    currency,
    item_count: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    items: items.map(itemLine).join('\n'),
    first_item_name: items[0] ? itemName(items[0]) : '',
  };
}

function itemName(item: SwellOrderItem): string {
  const name = item.product_name ?? 'Item';
  return item.variant_name ? `${name} (${item.variant_name})` : name;
}

function itemLine(item: SwellOrderItem): string {
  return `${item.quantity ?? 1} × ${itemName(item)}`;
}

/** An amount as text with two decimals and the currency code, e.g. "42.50 EUR". */
export function money(amount: number | undefined, currency: string): string {
  const value = (Math.round((amount ?? 0) * 100) / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}
