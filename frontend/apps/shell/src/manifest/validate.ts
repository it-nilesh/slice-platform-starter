import type { RemoteDefinition } from './types.ts';

// Keep in sync with gateway/config/mfe-manifest.schema.json.
// This file is also run directly by Node in CI (scripts/validate-manifest.ts),
// so it must use erasable TypeScript syntax only.

export const SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_REMOTES = 50;
const DEFAULT_EXPOSED_MODULE = './App';
const DEFAULT_NAV_ORDER = 100;

const NAME_RE = /^[a-z][a-z0-9-]{0,29}$/;
const ROUTE_RE = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const EXPOSED_RE = /^\.\/[A-Za-z0-9_-]+$/;
const SEGMENT = '[A-Za-z0-9_-]+';
/** Paths the shell must never hand to a remote: they belong to the gateway. */
const RESERVED_ROUTE_ROOTS = new Set(['api', 'mfe', 'config', 'assets', 'healthz']);
const REMOTE_KEYS = new Set(['name', 'entry', 'exposedModule', 'route', 'nav', 'enabled']);
const NAV_KEYS = new Set(['label', 'order']);

export class ManifestError extends Error {
  override name = 'ManifestError';
}

export interface ValidationResult {
  remotes: RemoteDefinition[];
  issues: string[];
}

/**
 * Validates an untrusted manifest document.
 *
 * - Throws ManifestError when the document as a whole is unusable (wrong shape or schema version).
 * - Otherwise drops only the bad entries, reporting each in `issues`, so one broken
 *   entry never takes down the rest of the application.
 * - Disabled entries (`enabled: false`) are silently excluded.
 */
export function validateManifest(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    throw new ManifestError('Manifest must be a JSON object.');
  }
  if (input.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new ManifestError(
      `Unsupported schemaVersion ${JSON.stringify(input.schemaVersion)}; expected ${SUPPORTED_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(input.remotes)) {
    throw new ManifestError('"remotes" must be an array.');
  }
  if (input.remotes.length > MAX_REMOTES) {
    throw new ManifestError(`"remotes" exceeds the maximum of ${MAX_REMOTES} entries.`);
  }

  const remotes: RemoteDefinition[] = [];
  const issues: string[] = [];

  input.remotes.forEach((raw: unknown, index: number) => {
    const label = isRecord(raw) && typeof raw.name === 'string' ? `remotes[${index}] "${raw.name}"` : `remotes[${index}]`;
    const result = validateRemote(raw);

    if (typeof result === 'string') {
      issues.push(`${label}: ${result}`);
      return;
    }
    if (result === null) return; // disabled

    const conflict = findConflict(result, remotes);
    if (conflict) {
      issues.push(`${label}: ${conflict}`);
      return;
    }
    remotes.push(result);
  });

  return { remotes, issues };
}

/** Returns the normalised entry, null when disabled, or an error message. */
function validateRemote(raw: unknown): RemoteDefinition | null | string {
  if (!isRecord(raw)) return 'must be an object';

  const unknownKey = Object.keys(raw).find((k) => !REMOTE_KEYS.has(k));
  if (unknownKey) return `unknown property "${unknownKey}"`;

  const { name, entry, exposedModule = DEFAULT_EXPOSED_MODULE, route, nav, enabled = true } = raw;

  if (typeof enabled !== 'boolean') return '"enabled" must be a boolean';
  if (typeof name !== 'string' || !NAME_RE.test(name)) return '"name" must match ' + NAME_RE.source;

  // Same-origin only and pinned under the remote's own /mfe/<name>/ prefix: the
  // manifest can never point the shell at an arbitrary script (CSP: script-src 'self').
  const entryRe = new RegExp(`^/mfe/${name}/(${SEGMENT}/)*remoteEntry(\\.${SEGMENT})?\\.js$`);
  if (typeof entry !== 'string' || !entryRe.test(entry)) {
    return `"entry" must be a same-origin path like /mfe/${name}/remoteEntry.js`;
  }

  if (typeof exposedModule !== 'string' || !EXPOSED_RE.test(exposedModule)) {
    return '"exposedModule" must look like ./App';
  }

  if (typeof route !== 'string' || !ROUTE_RE.test(route)) return '"route" must look like /my-route';
  const root = route.split('/')[1] ?? '';
  if (RESERVED_ROUTE_ROOTS.has(root)) return `"route" may not start with reserved segment "/${root}"`;

  let normalisedNav: RemoteDefinition['nav'];
  if (nav !== undefined) {
    if (!isRecord(nav)) return '"nav" must be an object';
    const unknownNavKey = Object.keys(nav).find((k) => !NAV_KEYS.has(k));
    if (unknownNavKey) return `unknown property "nav.${unknownNavKey}"`;
    const { label, order = DEFAULT_NAV_ORDER } = nav;
    if (typeof label !== 'string' || label.trim().length === 0 || label.length > 40) {
      return '"nav.label" must be 1-40 characters';
    }
    if (typeof order !== 'number' || !Number.isInteger(order)) return '"nav.order" must be an integer';
    normalisedNav = { label: label.trim(), order };
  }

  if (!enabled) return null;

  return { name, entry, exposedModule, route, ...(normalisedNav ? { nav: normalisedNav } : {}) };
}

function findConflict(candidate: RemoteDefinition, accepted: RemoteDefinition[]): string | undefined {
  for (const existing of accepted) {
    if (existing.name === candidate.name) return `duplicate name (already used by an earlier entry)`;
    if (routesOverlap(existing.route, candidate.route)) {
      return `route "${candidate.route}" overlaps "${existing.route}" (owned by "${existing.name}")`;
    }
  }
  return undefined;
}

/** "/a" overlaps "/a" and "/a/b" (the remote owns its whole subtree), but not "/ab". */
function routesOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
