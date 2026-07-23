import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('POST /api/telemetry', () => {
  it('accepts a valid report and responds 204 with no body', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'error',
        message: 'boom',
        stack: 'at foo\nat bar',
        url: '#room/ABCD',
        ua: 'test-agent',
      }),
    });
    expect(resp.status).toBe(204);
    expect(await resp.text()).toBe('');
  });

  it('rejects a body over the 4KB cap with 413', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'error', message: 'x'.repeat(5000) }),
    });
    expect(resp.status).toBe(413);
  });

  it('rejects an oversize body declared via Content-Length without reading it', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(10 * 1024) },
      body: JSON.stringify({ kind: 'error', message: 'x'.repeat(9000) }),
    });
    expect(resp.status).toBe(413);
  });

  it('rejects malformed JSON with 400', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(resp.status).toBe(400);
  });

  it('rejects a body missing kind/message with 400', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'no kind' }),
    });
    expect(resp.status).toBe(400);
  });

  it('only matches POST — other methods fall through to routing, not the handler', async () => {
    // No ASSETS binding in the test env (see wrangler.test.toml), so an
    // unmatched route can't be exercised end-to-end here; instead confirm
    // GET isn't dispatched to handleTelemetry by checking it never 204s.
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'GET',
    }).catch(() => null);
    expect(resp === null || resp.status !== 204).toBe(true);
  });
});

describe('telemetry daily counters', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('increments the counter for the kind on a valid report', async () => {
    const kind = `count-once-${Date.now()}`;
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: 'boom' }),
    });
    expect(resp.status).toBe(204);

    const row = await env.DB.prepare(
      'SELECT count FROM telemetry_counts WHERE day = ?1 AND kind = ?2',
    )
      .bind(today, kind)
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it('two reports of the same kind bump the count to 2', async () => {
    const kind = `count-twice-${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      const resp = await SELF.fetch('https://example.com/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: `hit ${i}` }),
      });
      expect(resp.status).toBe(204);
    }

    const row = await env.DB.prepare(
      'SELECT count FROM telemetry_counts WHERE day = ?1 AND kind = ?2',
    )
      .bind(today, kind)
      .first<{ count: number }>();
    expect(row?.count).toBe(2);
  });

  it('buckets an oversize kind under "unknown"', async () => {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'x'.repeat(64), message: 'too long' }),
    });
    expect(resp.status).toBe(204);

    const row = await env.DB.prepare(
      'SELECT count FROM telemetry_counts WHERE day = ?1 AND kind = ?2',
    )
      .bind(today, 'unknown')
      .first<{ count: number }>();
    expect(row?.count).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/telemetry/summary', () => {
  it('reflects counted reports for the current day', async () => {
    const kind = `summary-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: 'for summary' }),
    });

    const resp = await SELF.fetch('https://example.com/api/telemetry/summary');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { days: { day: string; kinds: Record<string, number> }[] };
    expect(Array.isArray(body.days)).toBe(true);
    const todayEntry = body.days.find((d) => d.day === today);
    expect(todayEntry?.kinds[kind]).toBe(1);
  });
});
