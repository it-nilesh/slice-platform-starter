import { describe, expect, it, vi } from 'vitest';
import { loadManifest } from './load.ts';

const valid = {
  schemaVersion: 1,
  remotes: [{ name: 'catalog', entry: '/mfe/catalog/remoteEntry.js', route: '/catalog' }],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const noSleep = () => Promise.resolve();

describe('loadManifest', () => {
  it('loads from the network and stores a last-known-good copy', async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => json(valid));

    const result = await loadManifest({ fetchImpl, storage, sleep: noSleep });

    expect(result.source).toBe('network');
    expect(result.remotes).toHaveLength(1);
    expect(storage.data.size).toBe(1);
  });

  it('retries transient failures (network error, 5xx) then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(valid));

    const result = await loadManifest({ fetchImpl, storage: memoryStorage(), sleep: noSleep });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('network');
  });

  it('does not retry a 404 and falls back to the cached copy', async () => {
    const storage = memoryStorage({ 'mfe.manifest.lkg.v1': JSON.stringify(valid) });
    const fetchImpl = vi.fn(async () => json({}, 404));

    const result = await loadManifest({ fetchImpl, storage, sleep: noSleep });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('cache');
    expect(result.remotes).toHaveLength(1);
    expect(result.error).toContain('404');
  });

  it('falls back to the cached copy when the live manifest is invalid', async () => {
    const storage = memoryStorage({ 'mfe.manifest.lkg.v1': JSON.stringify(valid) });
    const fetchImpl = vi.fn(async () => json({ schemaVersion: 99, remotes: [] }));

    const result = await loadManifest({ fetchImpl, storage, sleep: noSleep });

    expect(result.source).toBe('cache');
    expect(storage.data.get('mfe.manifest.lkg.v1')).toBe(JSON.stringify(valid)); // not overwritten
  });

  it('returns an empty manifest (never throws) when nothing is available', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });

    const result = await loadManifest({ fetchImpl, storage: memoryStorage(), retries: 1, sleep: noSleep });

    expect(result).toMatchObject({ source: 'none', remotes: [] });
    expect(result.error).toContain('offline');
  });

  it('survives storage that throws', async () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const result = await loadManifest({ fetchImpl: async () => json(valid), storage, sleep: noSleep });
    expect(result.source).toBe('network');
  });
});
