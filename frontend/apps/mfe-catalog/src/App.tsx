import { cart, type RemoteAppProps } from '@mfe/contracts';
import { useEffect, useState } from 'react';
import { getProducts, type Product } from './api.ts';
import styles from './App.module.css';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function App(_props: RemoteAppProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProducts(controller.signal)
      .then((data) => {
        setProducts(data);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error(err);
          setStatus('error');
        }
      });
    return () => controller.abort();
  }, []);

  const addToCart = (p: Product) => {
    cart.add({ productId: p.id, productName: p.name, unitPrice: p.price, quantity: 1 });
    setLastAdded(p.name);
  };

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h2>Catalog</h2>
        <span className={styles.badge}>mfe-catalog → catalog-api</span>
      </header>

      {status === 'loading' && <p>Loading products…</p>}
      {status === 'error' && <p className={styles.error}>Could not load products. Is catalog-api running?</p>}
      {lastAdded && <p className={styles.toast}>Added “{lastAdded}” to cart.</p>}

      <ul className={styles.grid}>
        {products.map((p) => (
          <li key={p.id} className={styles.card}>
            <img src={p.imageUrl} alt="" loading="lazy" width={400} height={240} />
            <div className={styles.body}>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className={styles.footer}>
                <strong>{currency.format(p.price)}</strong>
                <button type="button" onClick={() => addToCart(p)}>
                  Add to cart
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
