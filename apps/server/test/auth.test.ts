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
