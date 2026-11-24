/**
 * Security headers (securityHeaders.ts + the two paths that deliver them).
 *
 * Finding H1 of the audit: the live front door shipped none of CSP, HSTS,
 * nosniff, Referrer-Policy or frame-ancestors. These tests pin the policy
 * itself AND prove it rides out on the Worker-generated responses — the
 * asset-served half (dist/_headers) is covered by headersFileSource() being
 * built from the same list.
 */
import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/env.js';
import { ENFORCED, headersFileSource, withSecurityHeaders } from '../src/securityHeaders.js';

const csp = ENFORCED.find(([name]) => name === 'Content-Security-Policy')?.[1] ?? '';

// A faithful-enough shell for the /join/* rewrite and the asset fallback.
const BASELINE_HTML = `<!doctype html><html lang="en"><head><title>Jaffre</title>
<meta name="description" content="baseline" />
<meta property="og:title" content="Jaffre" />
<meta property="og:description" content="baseline" />
<meta property="og:url" content="https://jaffre.marcportal.com/" />
</head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;

const fakeAssets = {
  fetch: async () =>
    new Response(BASELINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
} as unknown as Fetcher;

function env(overrides: Partial<Env> = {}): Env {
  return { ...(testEnv as unknown as Env), ASSETS: fakeAssets, ...overrides };
}

// worker.fetch's declared ExecutionContext third arg is never read — same
// direct-call cast auth.test.ts / join.test.ts use.
const fetchAs = worker.fetch as unknown as (request: Request, env: Env) => Promise<Response>;

const REQUIRED = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
] as const;

describe('the enforced policy', () => {
  it('names every header the audit required', () => {
    for (const name of REQUIRED) {
      expect(ENFORCED.some(([n]) => n === name)).toBe(true);
    }
    expect(ENFORCED.find(([n]) => n === 'X-Content-Type-Options')?.[1]).toBe('nosniff');
    expect(ENFORCED.find(([n]) => n === 'Strict-Transport-Security')?.[1]).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(ENFORCED.find(([n]) => n === 'Referrer-Policy')?.[1]).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('fences framing to the app and the portal family, once', () => {
    expect(csp).toContain("frame-ancestors 'self' https://marcportal.com https://*.marcportal.com");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(csp.match(/frame-ancestors/g)).toHaveLength(1);
    // X-Frame-Options can't express a two-origin allowlist; frame-ancestors is
    // the whole story and XFO must not contradict it on either path.
    expect(ENFORCED.some(([n]) => n.toLowerCase() === 'x-frame-options')).toBe(false);
    expect(headersFileSource().toLowerCase()).not.toContain('x-frame-options');
  });

  it('locks the base and object surfaces', () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('admits exactly the real third parties and nothing wider', () => {
    // YouTube music dock.
    expect(csp).toContain('script-src');
    expect(csp).toContain('https://www.youtube.com');
    // The game socket.
    expect(csp).toContain("connect-src 'self' wss://jaffre.marcportal.com");
    // No blanket wildcard crept in.
    expect(csp).not.toContain("script-src 'self' *");
    expect(csp).not.toContain('default-src *');
  });

  it('keeps the microphone for voice chat while denying unused capabilities', () => {
    const pp = ENFORCED.find(([n]) => n === 'Permissions-Policy')?.[1] ?? '';
    expect(pp).toContain('microphone=(self)');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('geolocation=()');
  });

  it('builds the static-asset file from the same list', () => {
    const file = headersFileSource();
    expect(file).toContain('/*');
    for (const [name, value] of ENFORCED) {
      expect(file).toContain(`${name}: ${value}`);
    }
  });
});

describe('withSecurityHeaders', () => {
  it('adds every enforced header and preserves status and body', async () => {
    const wrapped = withSecurityHeaders(
      new Response('hello', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    for (const [name, value] of ENFORCED) {
      expect(wrapped.headers.get(name)).toBe(value);
    }
    expect(wrapped.status).toBe(200);
    expect(wrapped.headers.get('Content-Type')).toBe('text/plain');
    expect(await wrapped.text()).toBe('hello');
  });
});

describe('the Worker-served responses carry the headers', () => {
  it('the /join/* share shell', async () => {
    const res = await fetchAs(new Request('https://jaffre.marcportal.com/join/abcd'), env());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    for (const [name, value] of ENFORCED) {
      expect(res.headers.get(name)).toBe(value);
    }
    // The rewrite still ran — headers are additive, not a replacement.
    expect(await res.text()).toContain('id="root"');
  });

  it('the asset-binding fallback for a Worker-reached miss', async () => {
    const res = await fetchAs(
      new Request('https://jaffre.marcportal.com/some/deep/spa/route'),
      env(),
    );
    expect(res.status).toBe(200);
    for (const [name, value] of ENFORCED) {
      expect(res.headers.get(name)).toBe(value);
    }
  });
});
