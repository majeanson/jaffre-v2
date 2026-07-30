/**
 * First-party client error reporting, plus the 7-day counter summary.
 *
 * Degradation policy: this endpoint must NEVER throw and never fail on a
 * misbehaving client. The body is size-capped and loosely shape-checked, and
 * the daily D1 counter is best-effort — a missing or broken DB still answers
 * 204.
 */
import type { Env } from '../env.js';

const TELEMETRY_MAX_BYTES = 4 * 1024;
const TELEMETRY_KIND_MAX_LEN = 32;
const TELEMETRY_SUMMARY_DAYS = 7;
const TELEMETRY_SUMMARY_LIMIT = 200;

/**
 * Every kind the client can actually send — the four error kinds plus the two
 * window listeners in apps/web/src/net/telemetry.ts, and one entry per
 * `FunnelStep`.
 *
 * This is an ALLOWLIST rather than a length check because the bucket is a D1
 * primary-key column and this endpoint is unauthenticated: a client-controlled
 * string meant one row per distinct value, so anyone with curl could mint
 * unbounded rows in `telemetry_counts` AND one error-level log line each —
 * burying the real errors in exactly the tool you'd reach for during the
 * incident. Anything unrecognised still counts, under 'unknown'; nothing is
 * dropped, so a kind added to the client shows up as 'unknown' here rather
 * than vanishing, which is the failure mode you can actually notice.
 */
const TELEMETRY_KINDS: ReadonlySet<string> = new Set([
  'react-error',
  'ws-error',
  'ws-reconnect-loop',
  'mint-failed',
  'error',
  'unhandledrejection',
  ...['home', 'play', 'start', 'bid', 'finish', 'tutorial', 'daily', 'daily-score', 'people'].map(
    (step) => `funnel:${step}`,
  ),
]);

/** Sanitizes a telemetry kind for use as a counter bucket: a known kind, or
 * 'unknown' for anything else (missing, non-string, oversized, unrecognised). */
function telemetryKindBucket(kind: unknown): string {
  if (typeof kind !== 'string' || kind.length === 0 || kind.length > TELEMETRY_KIND_MAX_LEN) {
    return 'unknown';
  }
  return TELEMETRY_KINDS.has(kind) ? kind : 'unknown';
}

/**
 * POST /api/telemetry {kind, message, stack?, url?, ua?} → 204. First-party,
 * no-storage client error reporting: log one line so Workers Logs captures
 * it. Body is size-capped and loosely shape-checked — this must never throw
 * on malformed input from a misbehaving client.
 */
export async function handleTelemetry(request: Request, env: Env): Promise<Response> {
  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader !== null && Number(lengthHeader) > TELEMETRY_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > TELEMETRY_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== 'string' || typeof b.message !== 'string') {
    return Response.json({ error: 'kind and message must be strings' }, { status: 400 });
  }
  // Funnel milestones are not failures — logging them at error level would
  // bury real client errors in Workers Logs. Same counter bucket either way.
  const line = {
    kind: b.kind,
    message: b.message,
    stack: typeof b.stack === 'string' ? b.stack : undefined,
    url: typeof b.url === 'string' ? b.url : undefined,
    ua: typeof b.ua === 'string' ? b.ua : undefined,
  };
  if (b.kind.startsWith('funnel:')) console.log('[client]', line);
  else console.error('[client]', line);
  // Best-effort daily counter — a missing DB or a failed write must never
  // change this endpoint's behavior; it still always answers 204.
  if (env.DB !== undefined) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const kind = telemetryKindBucket(b.kind);
      await env.DB.prepare(
        `INSERT INTO telemetry_counts (day, kind, count) VALUES (?1, ?2, 1)
         ON CONFLICT(day, kind) DO UPDATE SET count = count + 1`,
      )
        .bind(day, kind)
        .run();
    } catch {
      // Swallow — telemetry counting is best-effort, never load-bearing.
    }
  }
  return new Response(null, { status: 204 });
}

/**
 * GET /api/telemetry/summary → { days: [{ day, kinds: { kind: count } }] }
 * for the last TELEMETRY_SUMMARY_DAYS days, newest first. No auth (counts
 * are harmless aggregates, not payloads). Returns { days: [] } when the DB
 * is absent — this must never throw.
 */
export async function handleTelemetrySummary(env: Env): Promise<Response> {
  if (env.DB === undefined) return Response.json({ days: [] });
  try {
    const since = new Date(Date.now() - TELEMETRY_SUMMARY_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const rows = await env.DB.prepare(
      `SELECT day, kind, count FROM telemetry_counts
       WHERE day >= ?1 ORDER BY day DESC, kind ASC LIMIT ?2`,
    )
      .bind(since, TELEMETRY_SUMMARY_LIMIT)
      .all<{ day: string; kind: string; count: number }>();

    const byDay = new Map<string, Record<string, number>>();
    for (const r of rows.results) {
      let kinds = byDay.get(r.day);
      if (kinds === undefined) {
        kinds = {};
        byDay.set(r.day, kinds);
      }
      kinds[r.kind] = r.count;
    }
    const days = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([day, kinds]) => ({ day, kinds }));
    return Response.json({ days });
  } catch {
    return Response.json({ days: [] });
  }
}
