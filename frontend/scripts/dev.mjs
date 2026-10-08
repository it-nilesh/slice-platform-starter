// Starts every app in apps/* in parallel. New microfrontends are picked up
// automatically: no shared file needs editing to add one.
import { readdirSync, existsSync } from 'node:fs';
import concurrently from 'concurrently';

const apps = readdirSync(new URL('../apps/', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(new URL(`../apps/${d.name}/package.json`, import.meta.url)))
  .map((d) => d.name)
  // Start remotes before the shell.
  .sort((a, b) => (a === 'shell') - (b === 'shell') || a.localeCompare(b));

const { result } = concurrently(
  apps.map((name) => ({ name, command: `npm run dev -w ${name}` })),
  { killOthersOn: ['failure'], prefixColors: ['blue', 'magenta', 'green', 'cyan', 'yellow'] },
);

result.catch(() => process.exit(1));
