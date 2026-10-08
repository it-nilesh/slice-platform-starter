/**
 * Contract shared by the shell and every microfrontend.
 *
 * Microfrontends are built and deployed independently, so they never share
 * in-memory state. They communicate only through:
 *   1. DOM CustomEvents on `window` (fire-and-forget notifications)
 *   2. sessionStorage (state that must survive navigation between MFEs)
 *
 * Treat changes here like a public API: additive only, never breaking.
 */

/**
 * Props the shell passes to every remote's exposed component.
 * Each remote must expose `./App` with a default export of
 * `ComponentType<RemoteAppProps>`.
 */
export interface RemoteAppProps {
  /** Route the remote is mounted under, e.g. "/catalog". The remote owns everything below it. */
  basePath: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export const MfeEvents = {
  CartChanged: 'mfe:cart:changed',
  OrderPlaced: 'mfe:order:placed',
} as const;

export interface MfeEventMap {
  [MfeEvents.CartChanged]: { items: CartItem[] };
  [MfeEvents.OrderPlaced]: { orderId: string };
}

export type MfeEventName = keyof MfeEventMap;

export function publish<K extends MfeEventName>(name: K, detail: MfeEventMap[K]): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Returns an unsubscribe function, suitable as a useEffect cleanup. */
export function subscribe<K extends MfeEventName>(
  name: K,
  handler: (detail: MfeEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<MfeEventMap[K]>).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

const CART_KEY = 'mfe.cart.v1';

export const cart = {
  get(): CartItem[] {
    try {
      return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '[]') as CartItem[];
    } catch {
      return [];
    }
  },

  add(item: CartItem): void {
    const items = cart.get();
    const existing = items.find((i) => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      items.push(item);
    }
    save(items);
  },

  clear(): void {
    save([]);
  },
};

function save(items: CartItem[]): void {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Storage may be unavailable (private mode, quota); events still flow.
  }
  publish(MfeEvents.CartChanged, { items });
}
