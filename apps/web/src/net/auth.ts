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

/** The current session token, if this browser holds a valid one. */
export function getSessionToken(): string | null {
  const cached = read();
  return cached !== null && cached.exp > Date.now() / 1000 ? cached.token : null;
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

/* ── Real login (optional, on top of guest) ───────────────────────────── */

const LINKS_KEY = 'jaffre-links';

/** Which durable credentials this identity carries (from /me and logins). */
export interface AccountLinks {
  readonly email: string | null;
  readonly google: boolean;
}

const NO_LINKS: AccountLinks = { email: null, google: false };

/** The cached account links for this browser's identity. */
export function getLinks(): AccountLinks {
  const raw = localStorage.getItem(LINKS_KEY);
  if (raw === null) return NO_LINKS;
  try {
    const l = JSON.parse(raw) as Partial<AccountLinks>;
    return { email: typeof l.email === 'string' ? l.email : null, google: l.google === true };
  } catch {
    return NO_LINKS;
  }
}

function storeLinks(l: AccountLinks): AccountLinks {
  localStorage.setItem(LINKS_KEY, JSON.stringify(l));
  return l;
}

/** True when the player already linked something durable — the "keep your
 * progress" nudges hide themselves. */
export function isLinked(): boolean {
  const l = getLinks();
  return l.email !== null || l.google;
}

/** Which login methods this deployment offers (secrets configured server-side).
 * {email:false, google:false} on any failure — the UI simply shows nothing. */
export async function fetchAuthMethods(): Promise<{ email: boolean; google: boolean }> {
  try {
    const res = await fetch('/api/auth/methods');
    if (!res.ok) return { email: false, google: false };
    const data = (await res.json()) as { email?: unknown; google?: unknown };
    return { email: data.email === true, google: data.google === true };
  } catch {
    return { email: false, google: false };
  }
}

/** Ask the server to email a 6-digit code. 'sent' | 'rate' (slow down) | 'error'. */
export async function startEmailLogin(email: string): Promise<'sent' | 'rate' | 'error'> {
  try {
    const res = await fetch('/api/auth/email/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return 'sent';
    return res.status === 429 ? 'rate' : 'error';
  } catch {
    return 'error';
  }
}

type LoginResponse = { userId: string; name: string; token: string } & ProfileFields & {
    links?: AccountLinks;
  };

function storeLogin(data: LoginResponse): StoredToken {
  const stored = storeToken(data);
  storeProfile(profileFrom(data));
  if (data.links !== undefined) storeLinks(data.links);
  return stored;
}

/**
 * Exchange the emailed code for a session. Sends the current Bearer so an
 * unlinked address LINKS to this guest (progress carries over). 'wrong' =
 * mistyped digits (retryable), 'expired' = request a fresh code.
 */
export async function verifyEmailLogin(
  email: string,
  code: string,
): Promise<StoredToken | 'wrong' | 'expired' | null> {
  try {
    const bearer = read()?.token;
    const res = await fetch('/api/auth/email/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer !== undefined ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ email, code }),
    });
    if (res.status === 401) return 'wrong';
    if (res.status === 404) return 'expired';
    if (!res.ok) return null;
    return storeLogin((await res.json()) as LoginResponse);
  } catch {
    return null;
  }
}

/** Where the Google button navigates — carries the current token so the
 * Google identity links to THIS guest instead of minting a stranger. */
export function googleLoginUrl(): string {
  const token = read()?.token;
  return token === undefined
    ? '/api/auth/google'
    : `/api/auth/google?link=${encodeURIComponent(token)}`;
}

/**
 * Boot-time: the Google callback bounces back with `#login=<token>&exp=…` (a
 * fragment — never in server logs). Store it, strip the hash, and refresh the
 * profile + links from /me. Returns the identity, or null when no fragment.
 */
export async function consumeLoginFragment(): Promise<StoredToken | null> {
  const match = /^#login=([^&]+)/.exec(location.hash);
  if (match === null || match[1] === undefined) return null;
  const token = decodeURIComponent(match[1]);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const payload = JSON.parse(atob(token.split('.')[0] ?? '')) as {
      uid?: string;
      name?: string;
    };
    if (typeof payload.uid !== 'string' || typeof payload.name !== 'string') return null;
    const stored = storeToken({ userId: payload.uid, name: payload.name, token });
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = (await res.json()) as ProfileFields & { links?: AccountLinks };
      storeProfile(profileFrom(data));
      if (data.links !== undefined) storeLinks(data.links);
    }
    return stored;
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
