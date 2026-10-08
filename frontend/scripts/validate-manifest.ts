// CI gate: validates the MFE manifest with exactly the same rules the shell
// applies at runtime, and checks every enabled remote is allowlisted at the gateway.
//
// Usage: node scripts/validate-manifest.ts <manifest.json> [allowlist.conf]
import { readFileSync } from 'node:fs';
import { validateManifest } from '../apps/shell/src/manifest/validate.ts';

const [manifestPath = '../gateway/config/mfe-manifest.json', allowlistPath] = process.argv.slice(2);
const errors: string[] = [];

try {
  const { remotes, issues } = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  errors.push(...issues);

  if (allowlistPath) {
    const allowed = readAllowlist(readFileSync(allowlistPath, 'utf8'), 'mfe_name');
    for (const r of remotes) {
      if (!allowed.has(r.name)) errors.push(`"${r.name}" is not in the $mfe_name allowlist (${allowlistPath})`);
    }
  }

  if (errors.length === 0) {
    console.log(`✓ ${manifestPath}: ${remotes.length} enabled remote(s): ${remotes.map((r) => r.name).join(', ')}`);
  }
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
}

if (errors.length > 0) {
  console.error(`✗ ${manifestPath}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

/** Extracts the keys mapped to 1 in `map $<variable> ... { ... }`. */
function readAllowlist(conf: string, variable: string): Set<string> {
  const block = new RegExp(`map\\s+\\$${variable}\\s+\\$\\w+\\s*\\{([^}]*)\\}`).exec(conf)?.[1] ?? '';
  return new Set(
    block
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim().match(/^([a-z][a-z0-9-]*)\s+1;$/)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
}
