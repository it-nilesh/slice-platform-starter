import { describe, expect, it } from 'vitest';
import { ManifestError, validateManifest } from './validate.ts';

const remote = (overrides: Record<string, unknown> = {}) => ({
  name: 'catalog',
  entry: '/mfe/catalog/remoteEntry.js',
  route: '/catalog',
  nav: { label: 'Catalog', order: 10 },
  ...overrides,
});

const manifest = (...remotes: unknown[]) => ({ schemaVersion: 1, remotes });

describe('validateManifest', () => {
  it('accepts a valid manifest and applies defaults', () => {
    const { remotes, issues } = validateManifest(manifest(remote({ nav: { label: ' Catalog ' } })));

    expect(issues).toEqual([]);
    expect(remotes).toEqual([
      {
        name: 'catalog',
        entry: '/mfe/catalog/remoteEntry.js',
        exposedModule: './App',
        route: '/catalog',
        nav: { label: 'Catalog', order: 100 },
      },
    ]);
  });

  it.each([null, [], 'x', { remotes: [] }, { schemaVersion: 2, remotes: [] }, { schemaVersion: 1 }])(
    'rejects an unusable document: %j',
    (doc) => {
      expect(() => validateManifest(doc)).toThrow(ManifestError);
    },
  );

  it('rejects more than the maximum number of remotes', () => {
    expect(() => validateManifest(manifest(...Array.from({ length: 51 }, () => remote())))).toThrow(ManifestError);
  });

  it('excludes disabled remotes without reporting an issue', () => {
    const { remotes, issues } = validateManifest(manifest(remote({ enabled: false })));
    expect(remotes).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('keeps valid entries when another entry is invalid', () => {
    const { remotes, issues } = validateManifest(
      manifest(remote(), remote({ name: 'orders', entry: 'https://evil.example/remoteEntry.js', route: '/orders' })),
    );
    expect(remotes.map((r) => r.name)).toEqual(['catalog']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"orders"');
  });

  describe('entry (script source) hardening', () => {
    it.each([
      'https://evil.example/mfe/catalog/remoteEntry.js',
      '//evil.example/mfe/catalog/remoteEntry.js',
      'javascript:alert(1)',
      'data:text/javascript,alert(1)',
      '/mfe/orders/remoteEntry.js',
      '/mfe/catalog/../orders/remoteEntry.js',
      '/mfe/catalog/%2e%2e/remoteEntry.js',
      '/mfe/catalog/remoteEntry.js?x=1',
      '/mfe/catalog/evil.js',
      'mfe/catalog/remoteEntry.js',
    ])('rejects %s', (entry) => {
      const { remotes, issues } = validateManifest(manifest(remote({ entry })));
      expect(remotes).toEqual([]);
      expect(issues[0]).toContain('"entry"');
    });

    it.each(['/mfe/catalog/remoteEntry.js', '/mfe/catalog/v2/remoteEntry.js', '/mfe/catalog/remoteEntry.a1b2c3.js'])(
      'accepts %s',
      (entry) => {
        expect(validateManifest(manifest(remote({ entry }))).remotes).toHaveLength(1);
      },
    );
  });

  it.each([
    [{ name: 'Catalog' }, '"name"'],
    [{ name: 'a'.repeat(31) }, '"name"'],
    [{ route: 'catalog' }, '"route"'],
    [{ route: '/Catalog' }, '"route"'],
    [{ route: '/api' }, 'reserved'],
    [{ route: '/mfe/x' }, 'reserved'],
    [{ exposedModule: '../App' }, '"exposedModule"'],
    [{ enabled: 'yes' }, '"enabled"'],
    [{ nav: { label: '' } }, '"nav.label"'],
    [{ nav: { label: 'x', order: 1.5 } }, '"nav.order"'],
    [{ nav: { label: 'x', icon: 'y' } }, 'nav.icon'],
    [{ extra: true }, 'unknown property "extra"'],
  ])('rejects invalid field %j', (overrides, expected) => {
    const { remotes, issues } = validateManifest(manifest(remote(overrides)));
    expect(remotes).toEqual([]);
    expect(issues[0]).toContain(expected);
  });

  it('rejects duplicate names and overlapping routes, keeping the first', () => {
    const { remotes, issues } = validateManifest(
      manifest(
        remote(),
        remote({ route: '/other' }),
        remote({ name: 'orders', entry: '/mfe/orders/remoteEntry.js', route: '/catalog/orders' }),
        remote({ name: 'catalogue', entry: '/mfe/catalogue/remoteEntry.js', route: '/catalogue' }),
      ),
    );
    expect(remotes.map((r) => r.name)).toEqual(['catalog', 'catalogue']);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('duplicate name');
    expect(issues[1]).toContain('overlaps');
  });
});
