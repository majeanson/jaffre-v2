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
const PROFILE_KEY = 'jaffre-profile';

/** The player's cosmetics: chosen palette colour, an optional painted canvas
 * (data URL), and the chosen card skin + theme. Cached locally so the identity
 * screen paints instantly, and kept in sync with the server on every mint /
 * recover / save so cosmetics follow the account across devices. */
export interface Profile {
  readonly color: string | null;
  readonly paint: string | null;
  readonly cardSkin: string | null;
  readonly theme: string | null;
}

const EMPTY_PROFILE: Profile = { color: null, paint: null, cardSkin: null, theme: null };

/** The cosmetic fields as they arrive on auth/profile responses (all optional). */
type ProfileFields = {
  color?: string | null;
  paint?: string | null;
  cardSkin?: string | null;
  theme?: string | null;
};

function profileFrom(d: ProfileFields): Profile {
  return {
    color: d.color ?? null,
    paint: d.paint ?? null,
    cardSkin: d.cardSkin ?? null,
    theme: d.theme ?? null,
  };
}

/** The cached cosmetics for this browser's current identity. */
export function getProfile(): Profile {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (raw === null) return EMPTY_PROFILE;
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      color: p.color ?? null,
      paint: p.paint ?? null,
      cardSkin: p.cardSkin ?? null,
      theme: p.theme ?? null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

function storeProfile(p: Profile): Profile {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  return p;
}

// Concurrent callers that both need a mint (fresh identity or a rename) must
// share ONE request — two parallel POSTs to /api/auth/guest create two separate
// identities and the second clobbers the first's cached token, breaking identity
// continuity (e.g. a room socket connect racing a background stats fetch would
// then reconnect as a different uid and lose the seat). Keyed by name so a
// concurrent rename still gets its own mint.
const mintInFlight = new Map<string, Promise<StoredToken | null>>();

export function getGuestToken(name: string): Promise<StoredToken | null> {
  const cached = read();
  // Reuse while valid for 7+ days and the name still matches.
  if (cached !== null && cached.exp - Date.now() / 1000 > 7 * 86400 && cached.name === name) {
    return Promise.resolve(cached);
  }
  const pending = mintInFlight.get(name);
  if (pending !== undefined) return pending;

  const mint = (async (): Promise<StoredToken | null> => {
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
      } & ProfileFields;
      const stored = storeToken(data);
      if (data.recoveryCode !== undefined) localStorage.setItem(RECOVERY_KEY, data.recoveryCode);
      storeProfile(profileFrom(data));
      return stored;
    } catch {
      return null;
    } finally {
      mintInFlight.delete(name);
    }
  })();
  mintInFlight.set(name, mint);
  return mint;
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
    const data = (await res.json()) as {
      userId: string;
      name: string;
      token: string;
    } & ProfileFields;
    const stored = storeToken(data);
    // A recovered identity carries its cosmetics to the new device.
    storeProfile(profileFrom(data));
    return stored;
  } catch {
    return null;
  }
}

/**
 * Persist a colour and/or painting for the current identity. Optimistically
 * updates the local cache first (so the UI reflects the choice immediately),
 * then POSTs it under the Bearer token. Returns the saved profile, or the
 * local cache unchanged when there is no token / the request fails.
 */
export async function saveProfile(patch: ProfileFields): Promise<Profile> {
  const current = getProfile();
  const optimistic: Profile = {
    color: patch.color !== undefined ? patch.color : current.color,
    paint: patch.paint !== undefined ? patch.paint : current.paint,
    cardSkin: patch.cardSkin !== undefined ? patch.cardSkin : current.cardSkin,
    theme: patch.theme !== undefined ? patch.theme : current.theme,
  };
  storeProfile(optimistic);
  const token = read()?.token;
  if (token === undefined) return optimistic;
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return optimistic; // 503 no-secret / 401 — keep the local look
    const data = (await res.json()) as ProfileFields;
    return storeProfile(profileFrom(data));
  } catch {
    return optimistic;
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
