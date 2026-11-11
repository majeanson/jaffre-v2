import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server mints `exp` in epoch MILLISECONDS and rejects `exp < Date.now()`.
 * The client once compared it as seconds, so an expired token read as valid
 * for decades: it was reused for ever, the socket 401'd on every attempt, and
 * the room sat on "Reconnecting…" with no way out. These pin the unit.
 */

const store = new Map<string, string>();
const DAY = 86_400_000;

function token(exp: number, name = 'Marc'): string {
  const body = btoa(JSON.stringify({ uid: 'u1', name, exp }));
  return `${body}.sig`;
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

function seed(exp: number, name = 'Marc'): void {
  store.set('jaffre-token', JSON.stringify({ token: token(exp, name), userId: 'u1', name, exp }));
}

describe('session token expiry (ms)', () => {
  it('an expired token is not a session', async () => {
    seed(Date.now() - DAY);
    const { getSessionToken } = await import('../src/net/auth.js');
    expect(getSessionToken()).toBeNull();
  });

  it('a live token is a session', async () => {
    seed(Date.now() + 30 * DAY);
    const { getSessionToken } = await import('../src/net/auth.js');
    expect(getSessionToken()).not.toBeNull();
  });

  it('a token inside its last week is re-minted, not reused', async () => {
    seed(Date.now() + 2 * DAY);
    const fresh = token(Date.now() + 90 * DAY);
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ userId: 'u1', name: 'Marc', token: fresh }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { getGuestToken } = await import('../src/net/auth.js');
    const got = await getGuestToken('Marc');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(got?.token).toBe(fresh);
  });

  it('a token with weeks left is reused without a network call', async () => {
    seed(Date.now() + 60 * DAY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { getGuestToken } = await import('../src/net/auth.js');
    await getGuestToken('Marc');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
