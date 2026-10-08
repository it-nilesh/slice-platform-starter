export interface RemoteNav {
  label: string;
  order: number;
}

/** A validated, normalised manifest entry. */
export interface RemoteDefinition {
  name: string;
  entry: string;
  exposedModule: string;
  route: string;
  nav?: RemoteNav;
}

export type ManifestSource = 'network' | 'cache' | 'none';

export interface LoadedManifest {
  remotes: RemoteDefinition[];
  /** Entries that were rejected, with the reason. The rest of the manifest still loads. */
  issues: string[];
  /** Where the manifest came from: live, last-known-good cache, or nothing at all. */
  source: ManifestSource;
  error?: string;
}
