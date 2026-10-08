import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

/**
 * The shell declares NO remotes at build time. It discovers them at runtime from
 * /config/mfe-manifest.json (served by the gateway). See src/main.tsx.
 */

const MANIFEST_FILE = fileURLToPath(new URL('../../../gateway/config/mfe-manifest.json', import.meta.url));
const DEV_SERVERS_FILE = fileURLToPath(new URL('../../mfe-dev-servers.json', import.meta.url));

interface DevServers {
  remotes: Record<string, string>;
  apis: Record<string, string>;
}

/** Dev only: serve the same manifest file the gateway serves in production. */
function devManifest(): Plugin {
  return {
    name: 'shell:dev-manifest',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/config/mfe-manifest.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(MANIFEST_FILE));
      });
    },
  };
}

/** Dev only: emulate the gateway's /mfe/<name> and /api/<name> routing. */
function devProxy(): Record<string, ProxyOptions> {
  const { remotes, apis } = JSON.parse(readFileSync(DEV_SERVERS_FILE, 'utf8')) as DevServers;
  return {
    ...Object.fromEntries(Object.entries(remotes).map(([name, target]) => [`/mfe/${name}/`, { target, ws: true }])),
    ...Object.fromEntries(Object.entries(apis).map(([name, target]) => [`/api/${name}`, { target }])),
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    federation({
      name: 'shell',
      remotes: {},
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
    react(),
    devManifest(),
  ],
  server: {
    port: 3000,
    strictPort: true,
    proxy: command === 'serve' ? devProxy() : undefined,
  },
  preview: { port: 3000, strictPort: true },
  build: { target: 'esnext' },
}));
