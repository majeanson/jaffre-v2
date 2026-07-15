import { describe, expect, it } from 'vitest';
import { isUsableSecret, mintToken, verifyToken } from '../src/auth/session.js';

const SECRET = 's'.repeat(48);
const OTHER_SECRET = 'x'.repeat(48);

function payload(overrides: Partial<{ uid: string; name: string; exp: number }> = {}) {
  return {
    uid: 'user-1',
    name: 'Alice',
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

describe('session tokens', () => {
  it('mints and verifies a valid token', async () => {
    const token = await mintToken(payload(), SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const identity = await verifyToken(token, SECRET);
    expect(identity).toEqual({ uid: 'user-1', name: 'Alice' });
  });

  it('round-trips a non-ASCII name', async () => {
    const token = await mintToken(payload({ name: 'Édith Piaf' }), SECRET);
    expect((await verifyToken(token, SECRET))?.name).toBe('Édith Piaf');
  });

  it('rejects a tampered payload', async () => {
    const token = await mintToken(payload(), SECRET);
    const [body, sig] = token.split('.') as [string, string];
    // Re-encode a different uid with the original signature.
    const forgedBody = btoa(
      JSON.stringify({ uid: 'mallory', name: 'Alice', exp: Date.now() + 60_000 }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifyToken(`${forgedBody}.${sig}`, SECRET)).toBeNull();
    // And a tampered signature on the original payload. Flip a middle
    // character (the final base64url char has ignored padding bits, so
    // flipping it can decode to identical bytes).
    const flipped = sig.slice(0, 10) + (sig[10] === 'A' ? 'B' : 'A') + sig.slice(11);
    expect(await verifyToken(`${body}.${flipped}`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await mintToken(payload(), OTHER_SECRET);
    expect(await verifyToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await mintToken(payload({ exp: Date.now() - 1000 }), SECRET);
    expect(await verifyToken(token, SECRET)).toBeNull();
  });

  it('rejects garbage tokens without throwing', async () => {
    for (const garbage of ['', 'no-dot', 'a.b', '!!!.???', 'YWJj.YWJj', '..', 'a.b.c']) {
      expect(await verifyToken(garbage, SECRET)).toBeNull();
    }
  });

  it('refuses a short or missing secret', async () => {
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret('short')).toBe(false);
    expect(isUsableSecret(SECRET)).toBe(true);
    await expect(mintToken(payload(), 'short')).rejects.toThrow();
    const token = await mintToken(payload(), SECRET);
    expect(await verifyToken(token, 'short')).toBeNull();
  });
});
