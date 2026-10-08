export interface UserProfile {
  displayName: string;
  email: string;
  updatedAt: string;
}

export interface ValidationProblem {
  title?: string;
  errors?: Record<string, string[]>;
}

// Relative URL: always same-origin through the gateway, so no CORS is needed.
const BASE_URL = '/api/profile';

export async function getProfile(signal?: AbortSignal): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/me`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Profile API responded ${res.status}`);
  return (await res.json()) as UserProfile;
}

export class ProfileValidationError extends Error {
  constructor(public readonly problem: ValidationProblem) {
    super(problem.title ?? 'Validation failed');
  }
}

export async function updateProfile(displayName: string, email: string): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ displayName, email }),
  });
  if (res.status === 400) {
    throw new ProfileValidationError((await res.json().catch(() => ({}))) as ValidationProblem);
  }
  if (!res.ok) throw new Error(`Profile API responded ${res.status}`);
  return (await res.json()) as UserProfile;
}
