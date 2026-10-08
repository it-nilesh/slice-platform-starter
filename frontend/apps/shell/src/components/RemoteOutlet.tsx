import type { RemoteAppProps } from '@mfe/contracts';
import { Component, lazy, Suspense, useEffect, useMemo, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import type { RemoteDefinition } from '../manifest/types.ts';
import { loadRemoteApp, resetRemote } from '../remotes/federation.ts';
import { reportError } from '../telemetry.ts';

interface Props {
  remote: RemoteDefinition;
  appName: string;
}

/**
 * Mounts one remote. Owns its loading state, error isolation and retry:
 * if the remote fails to download, times out or throws while rendering,
 * only this region shows an error and the rest of the shell keeps working.
 */
export function RemoteOutlet({ remote, appName }: Props) {
  const [attempt, setAttempt] = useState(0);
  const title = remote.nav?.label ?? remote.name;

  // React.lazy caches a rejected import forever, so each retry (attempt++) creates a fresh lazy component.
  const RemoteApp = useMemo<ComponentType<RemoteAppProps>>(
    () =>
      lazy(async () => {
        if (attempt > 0) resetRemote(remote, attempt);
        return { default: await loadRemoteApp(remote) };
      }),
    [remote, attempt],
  );

  useEffect(() => {
    document.title = `${title} · ${appName}`;
  }, [title, appName]);

  return (
    <RemoteErrorBoundary remote={remote} title={title} resetKey={attempt} onRetry={() => setAttempt((a) => a + 1)}>
      <Suspense
        fallback={
          <p className="shell-status" role="status" aria-live="polite">
            Loading {title}…
          </p>
        }
      >
        <RemoteApp basePath={remote.route} />
      </Suspense>
    </RemoteErrorBoundary>
  );
}

interface BoundaryProps {
  remote: RemoteDefinition;
  title: string;
  resetKey: number;
  onRetry: () => void;
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

class RemoteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('remote.failed', {
      remote: this.props.remote.name,
      entry: this.props.remote.entry,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  override componentDidUpdate(prev: BoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="shell-remote-error" role="alert">
        <h2>{this.props.title} is unavailable right now.</h2>
        <p>The rest of the application still works.</p>
        <div className="shell-actions">
          <button type="button" onClick={this.props.onRetry}>
            Try again
          </button>
          <button type="button" className="secondary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
