import type { RemoteAppProps } from '@mfe/contracts';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { getProfile, ProfileValidationError, updateProfile, type UserProfile } from './api.ts';
import styles from './App.module.css';

export default function App(_props: RemoteAppProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const nameId = useId();
  const emailId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getProfile(controller.signal)
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName);
        setEmail(p.email);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setMessage(null);
    setFieldErrors({});
    try {
      const updated = await updateProfile(displayName, email);
      setProfile(updated);
      setMessage('Profile saved.');
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        setFieldErrors(normalise(err.problem.errors ?? {}));
        setMessage(err.message);
      } else {
        setMessage('Could not save your profile. Try again.');
      }
    } finally {
      setStatus('ready');
    }
  };

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h2>Profile</h2>
        <span className={styles.badge}>mfe-profile → profile-api</span>
      </header>

      {status === 'loading' && <p role="status">Loading profile…</p>}
      {status === 'error' && (
        <p className={styles.error} role="alert">
          Could not load your profile. Is profile-api running?
        </p>
      )}

      {profile && (
        <form className={styles.panel} onSubmit={save} noValidate>
          <label htmlFor={nameId}>Display name</label>
          <input
            id={nameId}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.displayname)}
            aria-describedby={fieldErrors.displayname ? `${nameId}-error` : undefined}
          />
          {fieldErrors.displayname && (
            <span id={`${nameId}-error`} className={styles.error}>
              {fieldErrors.displayname.join(' ')}
            </span>
          )}

          <label htmlFor={emailId}>Email</label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          />
          {fieldErrors.email && (
            <span id={`${emailId}-error`} className={styles.error}>
              {fieldErrors.email.join(' ')}
            </span>
          )}

          <div className={styles.actions}>
            <button type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <span className={styles.muted}>Last updated {new Date(profile.updatedAt).toLocaleString()}</span>
          </div>
          {message && (
            <p role="status" aria-live="polite" className={styles.muted}>
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

/** ASP.NET Core keys validation errors by property name; normalise casing for lookup. */
function normalise(errors: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.toLowerCase(), v]));
}
