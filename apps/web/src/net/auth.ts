/**
 * Guest identity: mint a signed token once and cache it. Falls back to null
 * when the server runs without a SESSION_SECRET (local dev) — the socket then
 * uses the legacy plain ?u=&n= mode.
 */

interface StoredToken {
  readonly token: string;
  readonly userId: string;
  readonly name: string;
  readonly exp: number;
}

const KEY = 'jaffre-token';
const RECOVERY_KEY = 'jaffre-recovery';

export async function getGuestToken(name: string): Promise<StoredToken | null> {
  const cached = read();
  // Reuse while valid for 7+ days and the name still matches.
  if (cached !== null && cached.exp - Date.now() / 1000 > 7 * 86400 && cached.name === name) {
    return cached;
  }
  try {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Send the existing token, if any, so a rename mints a NEW token for
        // the SAME uid instead of a brand-new identity.
        ...(cached !== null ? { Authorization: `Bearer ${cached.token}` } : {}),
      },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null; // 503 = no-secret dev mode
    const data = (await res.json()) as {
      userId: string;
      name: string;
      token: string;
      recoveryCode?: string;
    };
    const stored = storeToken(data);
    if (data.recoveryCode !== undefined) localStorage.setItem(RECOVERY_KEY, data.recoveryCode);
    return stored;
  } catch {
    return null;
  }
}

/** The 3-word recovery code from this browser's first mint, if any — shown
 * once on the home screen, never re-issued after that. */
export function getRecoveryCode(): string | null {
  return localStorage.getItem(RECOVERY_KEY);
}

/** Exchange a recovery code (+ optional new name) for a token bound to the
 * uid that minted it, replacing whatever identity is currently cached. */
export async function recoverIdentity(code: string, name?: string): Promise<StoredToken | null> {
  try {
    const res = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name !== undefined ? { code, name } : { code }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { userId: string; name: string; token: string };
    return storeToken(data);
  } catch {
    return null;
  }
}

function storeToken(data: { userId: string; name: string; token: string }): StoredToken {
  const payload = JSON.parse(atob(data.token.split('.')[0] ?? '')) as { exp?: number };
  const stored: StoredToken = {
    token: data.token,
    userId: data.userId,
    name: data.name,
    exp: payload.exp ?? Date.now() / 1000 + 89 * 86400,
  };
  localStorage.setItem(KEY, JSON.stringify(stored));
  return stored;
}

function read(): StoredToken | null {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}
