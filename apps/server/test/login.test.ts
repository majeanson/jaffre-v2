import { env as testEnv } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/env.js';
import {
  generateLoginCode,
  hashLoginCode,
  signGoogleState,
  verifyGoogleState,
} from '../src/auth/login.js';

const SECRET = 's'.repeat(48);
/** Auth env with email login configured; the Resend key is fake — every test
 * that sends stubs global fetch and captures the payload instead. */
function loginEnv(): Env {
  return { ...testEnv, SESSION_SECRET: SECRET, RESEND_API_KEY: 're_test_key' } as unknown as Env;
}
/** Auth env with NO login method configured. Strips the auth secrets rather
 * than trusting testEnv to lack them: vitest-pool-workers loads `.dev.vars`,
 * so a developer's real RESEND_API_KEY would otherwise leak in and flip the
 * "unconfigured deployment" tests. */
function bareEnv(): Env {
  return {
    ...testEnv,
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  } as unknown as Env;
}

const fetchAs = worker.fetch as unknown as (request: Request, env: Env) => Promise<Response>;

interface MintResponse {
  readonly userId: string;
  readonly name: string;
  readonly token: string;
  readonly links: { readonly email: string | null; readonly google: boolean };
}

/** Stub the outbound Resend call and hand back the 6-digit code it carried. */
function captureCode(): { code: () => string } {
  let sent = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.resend.com/')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
        sent = /\b(\d{6})\b/.exec(body.text ?? '')?.[1] ?? '';
        return Response.json({ id: 'email-id' });
      }
      throw new Error(`unexpected outbound fetch in test: ${url}`);
    }),
  );
  return { code: () => sent };
}

function post(path: string, body: unknown, bearer?: string): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer !== undefined ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function startAndVerify(
  email: string,
  bearer?: string,
): Promise<{ status: number; body: MintResponse }> {
  const cap = captureCode();
  const started = await fetchAs(post('/api/auth/email/start', { email }), loginEnv());
  expect(started.status).toBe(200);
  const res = await fetchAs(
    post('/api/auth/email/verify', { email, code: cap.code() }, bearer),
    loginEnv(),
  );
  return { status: res.status, body: (await res.json()) as MintResponse };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login helpers', () => {
  it('generates 6-digit codes and binds hashes to the email', async () => {
    const code = generateLoginCode();
    expect(code).toMatch(/^\d{6}$/);
    const a = await hashLoginCode('a@example.com', code);
    expect(await hashLoginCode('a@example.com', code)).toBe(a); // deterministic
    expect(await hashLoginCode('b@example.com', code)).not.toBe(a); // email-bound
  });

  it('google state round-trips and rejects tampering', async () => {
    const state = await signGoogleState('uid-123', SECRET);
    expect((await verifyGoogleState(state, SECRET))?.linkUid).toBe('uid-123');
    expect(await verifyGoogleState(`${state}x`, SECRET)).toBeNull();
    expect(await verifyGoogleState(state, 'x'.repeat(48))).toBeNull();
  });
});

describe('/api/auth/methods', () => {
  it('reports which methods this deployment can offer', async () => {
    const bare = await fetchAs(new Request('https://example.com/api/auth/methods'), bareEnv());
    expect(await bare.json()).toEqual({ email: false, google: false });
    const withEmail = await fetchAs(
      new Request('https://example.com/api/auth/methods'),
      loginEnv(),
    );
    expect(await withEmail.json()).toEqual({ email: true, google: false });
  });
});

describe('email code sign-in', () => {
  it('creates a user on first verify and signs the same user in next time', async () => {
    const email = `fresh-${crypto.randomUUID()}@example.com`;
    const first = await startAndVerify(email);
    expect(first.status).toBe(200);
    expect(first.body.links.email).toBe(email);
    const again = await startAndVerify(email);
    expect(again.status).toBe(200);
    expect(again.body.userId).toBe(first.body.userId); // same identity
  });

  it('links the email to the signed-in guest so progress carries over', async () => {
    const guest = await fetchAs(post('/api/auth/guest', { name: 'Ginette' }), loginEnv());
    const g = (await guest.json()) as MintResponse;
    const email = `link-${crypto.randomUUID()}@example.com`;
    const linked = await startAndVerify(email, g.token);
    expect(linked.status).toBe(200);
    expect(linked.body.userId).toBe(g.userId); // SAME uid — nothing lost
    expect(linked.body.links.email).toBe(email);
  });

  it('rejects wrong codes and kills the code after the attempt cap', async () => {
    const email = `cap-${crypto.randomUUID()}@example.com`;
    const cap = captureCode();
    await fetchAs(post('/api/auth/email/start', { email }), loginEnv());
    const wrong = cap.code() === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await fetchAs(post('/api/auth/email/verify', { email, code: wrong }), loginEnv());
      expect(res.status).toBe(401);
    }
    // Attempts exhausted: even the REAL code is dead now.
    const spent = await fetchAs(
      post('/api/auth/email/verify', { email, code: cap.code() }),
      loginEnv(),
    );
    expect(spent.status).toBe(404);
  });

  it('rate-limits code requests per email', async () => {
    const email = `limit-${crypto.randomUUID()}@example.com`;
    captureCode();
    for (let i = 0; i < 5; i++) {
      const res = await fetchAs(post('/api/auth/email/start', { email }), loginEnv());
      expect(res.status).toBe(200);
    }
    const sixth = await fetchAs(post('/api/auth/email/start', { email }), loginEnv());
    expect(sixth.status).toBe(429);
  });

  it('503s cleanly when email login is not configured', async () => {
    const res = await fetchAs(post('/api/auth/email/start', { email: 'a@example.com' }), bareEnv());
    expect(res.status).toBe(503);
  });
});
