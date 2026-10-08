import { cart, MfeEvents, publish, subscribe, type CartItem, type RemoteAppProps } from '@mfe/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createOrder, getOrders, type Order, type PagedResult } from './api.ts';
import styles from './App.module.css';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function App(_props: RemoteAppProps) {
  const [items, setItems] = useState<CartItem[]>(() => cart.get());
  const [orders, setOrders] = useState<PagedResult<Order> | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = useCallback((signal?: AbortSignal) => {
    getOrders(1, 20, signal)
      .then(setOrders)
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Failed to load orders');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  useEffect(() => subscribe(MfeEvents.CartChanged, ({ items }) => setItems(items)), []);

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const order = await createOrder(email, items);
      cart.clear();
      publish(MfeEvents.OrderPlaced, { orderId: order.id });
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h2>Orders</h2>
        <span className={styles.badge}>mfe-orders → orders-api</span>
      </header>

      <div className={styles.panel}>
        <h3>Cart</h3>
        {items.length === 0 ? (
          <p className={styles.muted}>Your cart is empty. Add products from the Catalog.</p>
        ) : (
          <form onSubmit={placeOrder} className={styles.form}>
            <ul>
              {items.map((i) => (
                <li key={i.productId}>
                  {i.quantity} × {i.productName} <span>{currency.format(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <p>
              <strong>Estimated total: {currency.format(total)}</strong>
              <br />
              <span className={styles.muted}>Final prices are confirmed by the catalog when you place the order.</span>
            </p>
            <label>
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Placing…' : 'Place order'}
            </button>
          </form>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.panel}>
        <h3>Order history</h3>
        {!orders || orders.items.length === 0 ? (
          <p className={styles.muted}>No orders yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.items.map((o) => (
                <tr key={o.id}>
                  <td title={o.id}>{shortId(o.id)}</td>
                  <td>{o.customerEmail}</td>
                  <td>{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
                  <td>{currency.format(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {orders && orders.totalCount > orders.items.length && (
          <p className={styles.muted}>
            Showing the latest {orders.items.length} of {orders.totalCount} orders.
          </p>
        )}
      </div>
    </section>
  );
}

/** Order ids are UUIDv7: the first characters are a timestamp, so show the random tail instead. */
function shortId(id: string): string {
  return id.slice(-8);
}
