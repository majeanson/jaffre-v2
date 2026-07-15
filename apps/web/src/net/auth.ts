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

export async function getGuestToken(name: string): Promise<StoredToken | null> {
  const cached = read();
  // Reuse while valid for 7+ days and the name still matches.
  if (cached !== null && cached.exp - Date.now() / 1000 > 7 * 86400 && cached.name === name) {
    return cached;
  }
  try {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null; // 503 = no-secret dev mode
    const data = (await res.json()) as { userId: string; name: string; token: string };
    const payload = JSON.parse(atob(data.token.split('.')[0] ?? '')) as { exp?: number };
    const stored: StoredToken = {
      token: data.token,
      userId: data.userId,
      name: data.name,
      exp: payload.exp ?? Date.now() / 1000 + 89 * 86400,
    };
    localStorage.setItem(KEY, JSON.stringify(stored));
    return stored;
  } catch {
    return null;
  }
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
