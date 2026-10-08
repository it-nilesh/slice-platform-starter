import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served by the gateway under /mfe/profile/, so all asset URLs must carry that prefix.
const BASE = '/mfe/profile/';
const DEV_PORT = 3003;
const API_TARGET = process.env.PROFILE_API_URL ?? 'http://localhost:5103';

export default defineConfig({
  base: BASE,
  plugins: [
    federation({
      name: 'profile',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
    react(),
  ],
  server: {
    port: DEV_PORT,
    strictPort: true,
    origin: `http://localhost:${DEV_PORT}`,
    cors: true,
    // Standalone dev only; behind the gateway, NGINX routes /api.
    proxy: { '/api/profile': API_TARGET },
  },
  preview: { port: DEV_PORT, strictPort: true },
  build: { target: 'esnext' },
});
