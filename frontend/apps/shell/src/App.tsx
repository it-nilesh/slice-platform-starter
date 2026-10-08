import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { RemoteOutlet } from './components/RemoteOutlet.tsx';
import type { LoadedManifest } from './manifest/types.ts';

const APP_NAME = 'MFE PoC';

/** Routes and navigation are derived entirely from the runtime manifest. */
export default function App({ manifest }: { manifest: LoadedManifest }) {
  const navItems = useMemo(
    () =>
      manifest.remotes
        .filter((r) => r.nav)
        .sort((a, b) => a.nav!.order - b.nav!.order || a.nav!.label.localeCompare(b.nav!.label)),
    [manifest.remotes],
  );
  const home = navItems[0] ?? manifest.remotes[0];

  return (
    <Routes>
      <Route element={<Layout appName={APP_NAME} navItems={navItems} manifest={manifest} />}>
        <Route
          index
          element={home ? <Navigate to={home.route} replace /> : <NoRemotes error={manifest.error} />}
        />
        {manifest.remotes.map((remote) => (
          <Route
            key={remote.name}
            path={`${remote.route.slice(1)}/*`}
            element={<RemoteOutlet key={remote.name} remote={remote} appName={APP_NAME} />}
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NoRemotes({ error }: { error?: string }) {
  return (
    <div className="shell-remote-error" role="alert">
      <h2>No applications are available.</h2>
      <p>{error ? 'The application configuration could not be loaded.' : 'No microfrontends are enabled.'}</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}

function NotFound() {
  return (
    <div>
      <h2>Page not found</h2>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}
