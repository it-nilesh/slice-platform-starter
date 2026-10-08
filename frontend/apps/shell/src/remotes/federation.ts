import type { RemoteAppProps } from '@mfe/contracts';
import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type { ComponentType } from 'react';
import type { RemoteDefinition } from '../manifest/types.ts';

const LOAD_TIMEOUT_MS = 15_000;

export class RemoteLoadError extends Error {
  override name = 'RemoteLoadError';
}

const toRuntimeRemote = (r: RemoteDefinition, entry = r.entry) => ({
  name: r.name,
  entry,
  type: 'module',
  entryGlobalName: r.name,
  shareScope: 'default',
});

/** Registers manifest entries with the Module Federation runtime created by the host plugin. */
export function registerManifestRemotes(remotes: RemoteDefinition[]): void {
  if (remotes.length === 0) return;
  registerRemotes(remotes.map((r) => toRuntimeRemote(r)));
}

/**
 * Prepares a remote for another load attempt after a failure. The runtime caches
 * the failed remoteEntry load, so force re-registration (which clears that cache)
 * and bust the browser's module map with a query string.
 */
export function resetRemote(remote: RemoteDefinition, attempt: number): void {
  registerRemotes([toRuntimeRemote(remote, `${remote.entry}?retry=${attempt}`)], { force: true });
}

/** Loads a remote's exposed component and verifies it honours the contract. */
export async function loadRemoteApp(remote: RemoteDefinition): Promise<ComponentType<RemoteAppProps>> {
  const id = `${remote.name}/${remote.exposedModule.slice(2)}`;

  const mod = await withTimeout(
    loadRemote<{ default?: unknown }>(id),
    LOAD_TIMEOUT_MS,
    `Timed out after ${LOAD_TIMEOUT_MS} ms loading "${id}"`,
  );

  const component = mod?.default;
  if (!isComponent(component)) {
    throw new RemoteLoadError(`"${id}" does not default-export a React component`);
  }
  return component;
}

function isComponent(value: unknown): value is ComponentType<RemoteAppProps> {
  // Function/class components, or exotic components such as memo()/forwardRef().
  return typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RemoteLoadError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
