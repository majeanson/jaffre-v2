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

  /** The counter is a shared (day, kind) row, so every assertion here is a
   * DELTA. Tests used to dodge that with a unique kind each — which stopped
   * working once kinds became an allowlist, and was hiding the coupling
   * rather than removing it. */
  async function countOf(kind: string): Promise<number> {
    const row = await env.DB.prepare(
      'SELECT count FROM telemetry_counts WHERE day = ?1 AND kind = ?2',
    )
      .bind(today, kind)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async function report(kind: string, message = 'boom'): Promise<number> {
    const resp = await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message }),
    });
    return resp.status;
  }

  it('increments the counter for a known kind', async () => {
    const before = await countOf('ws-error');
    expect(await report('ws-error')).toBe(204);
    expect(await countOf('ws-error')).toBe(before + 1);
  });

  it('two reports of the same kind bump the count by 2', async () => {
    const before = await countOf('ws-reconnect-loop');
    expect(await report('ws-reconnect-loop', 'hit 0')).toBe(204);
    expect(await report('ws-reconnect-loop', 'hit 1')).toBe(204);
    expect(await countOf('ws-reconnect-loop')).toBe(before + 2);
  });

  it('buckets an oversize kind under "unknown"', async () => {
    const before = await countOf('unknown');
    expect(await report('x'.repeat(64), 'too long')).toBe(204);
    expect(await countOf('unknown')).toBe(before + 1);
  });

  /**
   * The bucket is a primary-key column on an UNAUTHENTICATED endpoint, so a
   * client-controlled kind meant one row per distinct string — unbounded rows
   * and an error-level log line each, which would bury real errors in the one
   * tool you'd reach for mid-incident.
   */
  it('buckets an unrecognised kind under "unknown" rather than minting a row', async () => {
    const rogue = 'definitely-not-a-real-kind';
    const beforeUnknown = await countOf('unknown');
    expect(await report(rogue, 'spam')).toBe(204);

    // Counted, but not under a name the caller chose.
    expect(await countOf('unknown')).toBe(beforeUnknown + 1);
    expect(await countOf(rogue)).toBe(0);
  });

  it('still counts every funnel step under its own name', async () => {
    // Two steps, not a loop over all of them: the latest addition ('people',
    // the practice recap's Play-people door) is exactly the kind that lands
    // in 'unknown' when someone forgets the allowlist — pin it explicitly.
    for (const step of ['funnel:daily-score', 'funnel:people']) {
      const before = await countOf(step);
      expect(await report(step, step)).toBe(204);
      expect(await countOf(step)).toBe(before + 1);
    }
  });
});

describe('GET /api/telemetry/summary', () => {
  it('reflects counted reports for the current day', async () => {
    const kind = 'mint-failed';
    const today = new Date().toISOString().slice(0, 10);
    const read = async (): Promise<number> => {
      const resp = await SELF.fetch('https://example.com/api/telemetry/summary');
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        days: { day: string; kinds: Record<string, number> }[];
      };
      expect(Array.isArray(body.days)).toBe(true);
      return body.days.find((d) => d.day === today)?.kinds[kind] ?? 0;
    };

    const before = await read();
    await SELF.fetch('https://example.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: 'for summary' }),
    });
    expect(await read()).toBe(before + 1);
  });
});
