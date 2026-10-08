import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import './index.css';
import { loadManifest } from './manifest/load.ts';
import { registerManifestRemotes } from './remotes/federation.ts';
import { reportError } from './telemetry.ts';

// The shell knows nothing about its remotes at build time: it discovers them from
// the runtime manifest, so adding a microfrontend never requires redeploying the shell.
const manifest = await loadManifest();

if (manifest.error) {
  reportError('manifest.unavailable', { source: manifest.source, error: manifest.error });
}
if (manifest.issues.length > 0) {
  reportError('manifest.invalid_entries', { issues: manifest.issues });
}

try {
  registerManifestRemotes(manifest.remotes);
} catch (err) {
  reportError('manifest.register_failed', { error: String(err) });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App manifest={manifest} />
    </BrowserRouter>
  </StrictMode>,
);
