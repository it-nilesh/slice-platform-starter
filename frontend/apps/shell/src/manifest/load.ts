import type { LoadedManifest } from './types.ts';
import { ManifestError, validateManifest } from './validate.ts';

export const MANIFEST_URL = '/config/mfe-manifest.json';
const CACHE_KEY = 'mfe.manifest.lkg.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoadManifestOptions {
  url?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Additional attempts after the first, for transient failures only. */
  retries?: number;
  fetchImpl?: typeof fetch;
  storage?: StorageLike | null;
  sleep?: (ms: number) => Promise<void>;
}

class TransientError extends Error {}

/**
 * Fetches and validates the manifest. Never throws: the shell must always render.
 *
 * 1. Fetch with timeout; retry with exponential backoff on network errors, timeouts and 5xx.
 * 2. On success, persist it as the last-known-good (LKG) copy.
 * 3. If the live manifest is unavailable or invalid, fall back to the LKG copy.
 * 4. If there is no usable copy at all, return an empty manifest plus the error.
 */
export async function loadManifest(options: LoadManifestOptions = {}): Promise<LoadedManifest> {
  const {
    url = MANIFEST_URL,
    timeoutMs = 5_000,
    retries = 2,
    fetchImpl = globalThis.fetch.bind(globalThis),
    storage = defaultStorage(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** attempt);
    try {
      const raw = await fetchJson(fetchImpl, url, timeoutMs);
      const { remotes, issues } = validateManifest(raw);
      safeSet(storage, CACHE_KEY, JSON.stringify(raw));
      return { remotes, issues, source: 'network' };
    } catch (err) {
      lastError = err;
      if (!(err instanceof TransientError)) break; // 4xx / invalid document: retrying will not help
    }
  }

  const cached = safeGet(storage, CACHE_KEY);
  if (cached) {
    try {
      const { remotes, issues } = validateManifest(JSON.parse(cached));
      return { remotes, issues, source: 'cache', error: describe(lastError) };
    } catch {
      // Corrupt cache: fall through to the empty manifest.
    }
  }

  return { remotes: [], issues: [], source: 'none', error: describe(lastError) };
}

async function fetchJson(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new TransientError(`Manifest request failed: ${describe(err)}`);
  }

  if (res.status >= 500) throw new TransientError(`Manifest request failed with HTTP ${res.status}`);
  if (!res.ok) throw new ManifestError(`Manifest request failed with HTTP ${res.status}`);

  try {
    return await res.json();
  } catch {
    throw new ManifestError('Manifest is not valid JSON.');
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Access can throw when storage is blocked.
  }
}

function safeGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Quota exceeded / blocked: the LKG cache is best effort.
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
