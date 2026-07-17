import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/env.js';

// The shared test env (wrangler.test.toml) deliberately has no
// SESSION_SECRET so the plain ?u=&n= tests keep working (see room.test.ts).
// These tests need token auth, so they layer a secret onto that same env —
// D1 (with migrations already applied by apply-migrations.ts) is reused as-is.
const SECRET = 's'.repeat(48);
function authEnv(): Env {
  return { ...testEnv, SESSION_SECRET: SECRET } as unknown as Env;
}

// worker.fetch's declared type carries an ExecutionContext third parameter
// that the implementation never reads; the tests below call it directly
// (bypassing SELF, which is pinned to the secret-less wrangler.test.toml env).
const fetchAs = worker.fetch as unknown as (request: Request, env: Env) => Promise<Response>;

interface GuestResponse {
  readonly userId: string;
  readonly name: string;
  readonly token: string;
  readonly exp: number;
  readonly recoveryCode?: string;
  readonly color: string | null;
  readonly paint: string | null;
  readonly cardSkin: string | null;
  readonly theme: string | null;
}

async function saveProfile(
  bearer: string,
  patch: {
    color?: string | null;
    paint?: string | null;
    cardSkin?: string | null;
    theme?: string | null;
  },
): Promise<Response> {
  return fetchAs(
    new Request('https://example.com/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(patch),
    }),
    authEnv(),
  );
}

async function me(bearer: string): Promise<Response> {
  return fetchAs(
    new Request('https://example.com/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${bearer}` },
    }),
    authEnv(),
  );
}

async function guest(name: string, bearer?: string): Promise<Response> {
  return fetchAs(
    new Request('https://example.com/api/auth/guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer !== undefined ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ name }),
    }),
    authEnv(),
  );
}

async function recover(code: string, name?: string): Promise<Response> {
  return fetchAs(
    new Request('https://example.com/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name !== undefined ? { code, name } : { code }),
    }),
    authEnv(),
  );
}

describe('POST /api/auth/guest', () => {
  it('first mint returns a recovery code and persists only its hash', async () => {
    const res = await guest('Alice');
    expect(res.status).toBe(200);
    const data = (await res.json()) as GuestResponse;
    expect(data.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.name).toBe('Alice');
    expect(typeof data.exp).toBe('number');
    expect(data.recoveryCode).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);

    const row = await testEnv.DB.prepare('SELECT recovery_hash FROM users WHERE id = ?1')
      .bind(data.userId)
      .first<{ recovery_hash: string | null }>();
    expect(row?.recovery_hash).toBeTruthy();
    expect(row?.recovery_hash).not.toBe(data.recoveryCode);
  });

  it('re-mints with a Bearer token for the same uid and no recovery code', async () => {
    const first = (await (await guest('Bob')).json()) as GuestResponse;
    const res = await guest('Bobby', first.token);
    expect(res.status).toBe(200);
    const data = (await res.json()) as GuestResponse;
    expect(data.userId).toBe(first.userId);
    expect(data.name).toBe('Bobby');
    expect(data.recoveryCode).toBeUndefined();
    expect(data.token).not.toBe(first.token);

    const row = await testEnv.DB.prepare('SELECT name FROM users WHERE id = ?1')
      .bind(first.userId)
      .first<{ name: string }>();
    expect(row?.name).toBe('Bobby');
  });
});

describe('POST /api/auth/recover', () => {
  it('round-trips: mint, recover with the code, same uid', async () => {
    const minted = (await (await guest('Carla')).json()) as GuestResponse;
    expect(minted.recoveryCode).toBeDefined();
    const res = await recover(minted.recoveryCode as string);
    expect(res.status).toBe(200);
    const data = (await res.json()) as GuestResponse;
    expect(data.userId).toBe(minted.userId);
    expect(data.name).toBe('Carla');
    expect(data.recoveryCode).toBeUndefined();
  });

  it('recovering with a new name renames the user', async () => {
    const minted = (await (await guest('Dave')).json()) as GuestResponse;
    const res = await recover(minted.recoveryCode as string, 'Davey');
    const data = (await res.json()) as GuestResponse;
    expect(data.userId).toBe(minted.userId);
    expect(data.name).toBe('Davey');
  });

  it('404s on an unknown code', async () => {
    const res = await recover('nope-nope-nope');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/profile — colour + paint persistence', () => {
  it('a new mint has no colour or paint', async () => {
    const data = (await (await guest('Nora')).json()) as GuestResponse;
    expect(data.color).toBeNull();
    expect(data.paint).toBeNull();
  });

  it('round-trips a chosen colour: save, then /me and recover both echo it', async () => {
    const minted = (await (await guest('Otto')).json()) as GuestResponse;
    const saved = await saveProfile(minted.token, { color: '#7A6FF0' });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { userId: string; color: string | null };
    expect(savedBody.userId).toBe(minted.userId);
    // Persisted lower-cased.
    expect(savedBody.color).toBe('#7a6ff0');

    const meBody = (await (await me(minted.token)).json()) as GuestResponse;
    expect(meBody.color).toBe('#7a6ff0');

    // The colour follows the identity across a recovery on a new device.
    const recovered = (await (
      await recover(minted.recoveryCode as string)
    ).json()) as GuestResponse;
    expect(recovered.userId).toBe(minted.userId);
    expect(recovered.color).toBe('#7a6ff0');
  });

  it('persists a painted-card data URL and clears it with null', async () => {
    const minted = (await (await guest('Pia')).json()) as GuestResponse;
    const paint = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const saved = (await (await saveProfile(minted.token, { paint })).json()) as {
      paint: string | null;
    };
    expect(saved.paint).toBe(paint);

    const meBody = (await (await me(minted.token)).json()) as GuestResponse;
    expect(meBody.paint).toBe(paint);

    const cleared = (await (await saveProfile(minted.token, { paint: null })).json()) as {
      paint: string | null;
    };
    expect(cleared.paint).toBeNull();
  });

  it('saving a colour leaves an existing paint untouched (partial update)', async () => {
    const minted = (await (await guest('Quinn')).json()) as GuestResponse;
    const paint = 'data:image/png;base64,AAAA';
    await saveProfile(minted.token, { paint });
    await saveProfile(minted.token, { color: '#58b884' });
    const meBody = (await (await me(minted.token)).json()) as GuestResponse;
    expect(meBody.color).toBe('#58b884');
    expect(meBody.paint).toBe(paint);
  });

  it('rejects a non-hex colour and a bare empty body', async () => {
    const minted = (await (await guest('Rae')).json()) as GuestResponse;
    expect((await saveProfile(minted.token, { color: 'blue' })).status).toBe(400);
    expect((await saveProfile(minted.token, {})).status).toBe(400);
  });

  it('401s without a valid bearer token', async () => {
    const res = await fetchAs(
      new Request('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: '#7a6ff0' }),
      }),
      authEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/profile — cosmetics (card skin + theme) persistence', () => {
  it('a new mint has no card skin or theme', async () => {
    const data = (await (await guest('Cosmo')).json()) as GuestResponse;
    expect(data.cardSkin).toBeNull();
    expect(data.theme).toBeNull();
  });

  it('round-trips card skin + theme: save, then /me and recover both echo them', async () => {
    const minted = (await (await guest('Skye')).json()) as GuestResponse;
    const saved = (await (
      await saveProfile(minted.token, { cardSkin: 'neon', theme: 'midnight' })
    ).json()) as GuestResponse;
    expect(saved.cardSkin).toBe('neon');
    expect(saved.theme).toBe('midnight');

    const meBody = (await (await me(minted.token)).json()) as GuestResponse;
    expect(meBody.cardSkin).toBe('neon');
    expect(meBody.theme).toBe('midnight');

    // Cosmetics follow the identity across a recovery on a new device.
    const recovered = (await (
      await recover(minted.recoveryCode as string)
    ).json()) as GuestResponse;
    expect(recovered.cardSkin).toBe('neon');
    expect(recovered.theme).toBe('midnight');
  });

  it('clears a card skin with null and leaves colour untouched (partial update)', async () => {
    const minted = (await (await guest('Vale')).json()) as GuestResponse;
    await saveProfile(minted.token, { color: '#7a6ff0', cardSkin: 'noir' });
    const cleared = (await (
      await saveProfile(minted.token, { cardSkin: null })
    ).json()) as GuestResponse;
    expect(cleared.cardSkin).toBeNull();
    expect(cleared.color).toBe('#7a6ff0');
  });

  it('rejects a malformed skin id (not a lowercase slug)', async () => {
    const minted = (await (await guest('Wren')).json()) as GuestResponse;
    expect((await saveProfile(minted.token, { cardSkin: 'Neon!' })).status).toBe(400);
    expect((await saveProfile(minted.token, { theme: 'A B' })).status).toBe(400);
  });
});
