/**
 * First-party error telemetry: no third-party SDK. Catches uncaught errors
 * and unhandled promise rejections, then beacons a small, capped report to
 * the server (POST /api/telemetry) which just logs it — no client-side
 * storage, no PII beyond what already lands in the URL hash / UA string.
 */

const MAX_REPORTS_PER_SESSION = 10;
/** Funnel milestones get their own small budget: they're latched one-shot per
 * browser, and they must not be crowded out by (or crowd out) error reports. */
const MAX_FUNNEL_PER_SESSION = 8;
const MESSAGE_CAP = 300;
const STACK_CAP = 600;
const STACK_LINES = 3;

let reportCount = 0;
let funnelCount = 0;

interface TelemetryReport {
  readonly kind: string;
  /** J6: a short id stamped on every beacon (not just errors) so a report
   * that DOES surface to a player — currently only ErrorBoundary's crash
   * screen — can be matched back to this exact log line server-side. */
  readonly id: string;
  readonly message: string;
  readonly stack?: string;
  readonly url: string;
  readonly ua: string;
}

function truncate(s: string, cap: number): string {
  return s.length > cap ? s.slice(0, cap) : s;
}

function stackHead(stack: string | undefined): string | undefined {
  if (stack === undefined || stack === '') return undefined;
  const head = stack.split('\n').slice(0, STACK_LINES).join('\n');
  return truncate(head, STACK_CAP);
}

/** 6 hex chars — short enough to read aloud or type into a bug report, long
 * enough (16.7M values) that two ids in the same session collide only by
 * wild coincidence. Not a security token: it exists purely to let a human
 * match a support message to a log line, so a short, guessable id is fine. */
function makeReportId(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
}

/** Returns the id stamped on this report — generated even when the beacon
 * ends up not being sent (dev mode, session budget exhausted), so a caller
 * that shows the id to the user always has ONE to show, even if it never
 * reaches a server to match. */
function send(kind: string, message: string, stack?: string): string {
  const id = makeReportId();
  try {
    if (import.meta.env.DEV) return id; // never report from localhost/dev
    const isFunnel = kind.startsWith('funnel:');
    if (isFunnel) {
      if (funnelCount >= MAX_FUNNEL_PER_SESSION) return id;
      funnelCount += 1;
    } else {
      if (reportCount >= MAX_REPORTS_PER_SESSION) return id;
      reportCount += 1;
    }
    const head = stackHead(stack);
    const report: TelemetryReport = {
      kind,
      id,
      message: truncate(message, MESSAGE_CAP),
      ...(head !== undefined ? { stack: head } : {}),
      url: location.hash,
      ua: navigator.userAgent,
    };
    const body = JSON.stringify(report);
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
    if (!sent) {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never itself be a source of errors.
  }
  return id;
}

/** Beacon a caught error — a React render error (from an ErrorBoundary) by
 * default, or another `kind` (e.g. 'ws-error', 'mint-failed',
 * 'ws-reconnect-loop') for net-layer failures. Same capped, fire-and-forget
 * path as the window listeners — never throws. Returns the report id (see
 * `makeReportId`) so a caller that shows a crash screen can print it. */
export function reportError(error: unknown, componentStack?: string, kind = 'react-error'): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return send(kind, message, stack ?? componentStack);
}

/**
 * The first-session funnel: the handful of moments that say whether a new
 * player actually got into a game. Each fires at most ONCE per browser (a
 * localStorage latch), so this measures first-run drop-off, not usage — and
 * the volume is a few beacons per install, ever.
 *
 * Because the latch is per STEP, a stage that has an opening and a completion
 * needs two of them: `daily` says the Deal Board was found at all, and
 * `daily-score` says a run made it onto the board. One step reported twice
 * would only ever tell us the first half.
 *
 * Deliberately anonymous: the kind is the only payload, so nothing here
 * identifies anyone. The server already buckets unknown kinds by name, so
 * they land in /api/telemetry/summary with no schema change.
 */
export type FunnelStep =
  | 'home' // first paint of the title screen
  | 'play' // opened the PLAY door
  | 'start' // first game started (mode in the message)
  | 'bid' // first bid ever placed
  | 'finish' // first game played to the end
  | 'tutorial' // finished the practice tutorial
  | 'daily' // first time the Deal Board was opened
  | 'daily-score' // first score actually posted to a board
  | 'people'; // took the practice recap's "Play people" door to a real room

const FUNNEL_KEY = 'jaffre:funnel';

function funnelSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    return new Set(raw === null ? [] : (JSON.parse(raw) as string[]));
  } catch {
    return new Set();
  }
}

/** Report a first-session milestone, once per browser. `detail` adds context
 * (e.g. which mode the first game was) and is never identifying. */
export function reportFunnel(step: FunnelStep, detail = ''): void {
  try {
    // Automation would skew the counters with a fresh funnel every run.
    if (navigator.webdriver === true) return;
    const seen = funnelSeen();
    if (seen.has(step)) return;
    seen.add(step);
    try {
      localStorage.setItem(FUNNEL_KEY, JSON.stringify([...seen]));
    } catch {
      // Storage unavailable — at worst the step reports again next session.
    }
    send(`funnel:${step}`, detail === '' ? step : detail);
  } catch {
    // Telemetry must never itself be a source of errors.
  }
}

/** Installs window-level error and unhandled-rejection listeners. Call once
 * at app bootstrap. */
export function installTelemetry(): void {
  try {
    window.addEventListener('error', (event) => {
      send('error', event.message ?? String(event.error), event.error?.stack as string | undefined);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      send('unhandledrejection', message, stack);
    });
  } catch {
    // Telemetry must never itself be a source of errors.
  }
}
