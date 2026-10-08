import type { CartItem } from '@mfe/contracts';

export interface OrderLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface Order {
  id: string;
  customerEmail: string;
  lines: OrderLine[];
  createdAt: string;
  total: number;
}

// Relative URL: always same-origin through the gateway, so no CORS is needed.
const BASE_URL = '/api/orders';

export async function getOrders(page = 1, pageSize = 20, signal?: AbortSignal): Promise<PagedResult<Order>> {
  const res = await fetch(`${BASE_URL}?page=${page}&pageSize=${pageSize}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Orders API responded ${res.status}`);
  return (await res.json()) as PagedResult<Order>;
}

/**
 * Sends only product ids and quantities. Names and prices are looked up by
 * orders-api in catalog-api; the cart's prices are display estimates only.
 */
export async function createOrder(customerEmail: string, items: CartItem[]): Promise<Order> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      customerEmail,
      lines: items.map(({ productId, quantity }) => ({ productId, quantity })),
    }),
  });
  if (!res.ok) throw new Error(await problemMessage(res));
  return (await res.json()) as Order;
}

/** Turns an RFC 9457 problem details response into a readable message. */
async function problemMessage(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => null)) as {
    title?: string;
    detail?: string;
    errors?: Record<string, string[]>;
  } | null;
  const firstError = problem?.errors && Object.values(problem.errors).flat()[0];
  return firstError ?? problem?.detail ?? problem?.title ?? `Orders API responded ${res.status}`;
}
