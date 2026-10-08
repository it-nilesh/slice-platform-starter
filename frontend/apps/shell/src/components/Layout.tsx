import { cart, MfeEvents, subscribe } from '@mfe/contracts';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import type { LoadedManifest, RemoteDefinition } from '../manifest/types.ts';

interface Props {
  appName: string;
  navItems: RemoteDefinition[];
  manifest: LoadedManifest;
}

export function Layout({ appName, navItems, manifest }: Props) {
  const [cartCount, setCartCount] = useState(() => count(cart.get()));
  const [notice, setNotice] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => subscribe(MfeEvents.CartChanged, ({ items }) => setCartCount(count(items))), []);
  useEffect(
    () => subscribe(MfeEvents.OrderPlaced, ({ orderId }) => setNotice(`Order ${shortId(orderId)} placed.`)),
    [],
  );

  // Accessibility: on client-side navigation, move focus to the new content
  // so screen-reader and keyboard users are not left on the old link.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="shell">
      <a className="shell-skip" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <strong className="shell-brand">{appName}</strong>
        <nav aria-label="Main">
          {navItems.map((r) => (
            <NavLink key={r.name} to={r.route}>
              {r.nav?.label}
            </NavLink>
          ))}
        </nav>
        <span className="shell-cart" aria-live="polite" aria-label={`Cart: ${cartCount} items`}>
          Cart {cartCount}
        </span>
      </header>

      {manifest.source === 'cache' && (
        <div className="shell-banner warning" role="status">
          Running on a cached configuration. Some features may be out of date.
        </div>
      )}
      {notice && (
        <div className="shell-banner success" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}

      <main id="main" className="shell-main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

function count(items: { quantity: number }[]): number {
  return items.reduce((n, i) => n + i.quantity, 0);
}

/** Order ids are UUIDv7: the first characters are a timestamp, so show the random tail instead. */
function shortId(id: string): string {
  return id.slice(-8);
}
