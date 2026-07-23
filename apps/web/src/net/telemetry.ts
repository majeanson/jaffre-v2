/**
 * First-party error telemetry: no third-party SDK. Catches uncaught errors
 * and unhandled promise rejections, then beacons a small, capped report to
 * the server (POST /api/telemetry) which just logs it — no client-side
 * storage, no PII beyond what already lands in the URL hash / UA string.
 */

const MAX_REPORTS_PER_SESSION = 10;
const MESSAGE_CAP = 300;
const STACK_CAP = 600;
const STACK_LINES = 3;

let reportCount = 0;

interface TelemetryReport {
  readonly kind: string;
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

function send(kind: string, message: string, stack?: string): void {
  try {
    if (import.meta.env.DEV) return; // never report from localhost/dev
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;
    reportCount += 1;
    const head = stackHead(stack);
    const report: TelemetryReport = {
      kind,
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
}

/** Beacon a caught error — a React render error (from an ErrorBoundary) by
 * default, or another `kind` (e.g. 'ws-error', 'mint-failed',
 * 'ws-reconnect-loop') for net-layer failures. Same capped, fire-and-forget
 * path as the window listeners — never throws. */
export function reportError(error: unknown, componentStack?: string, kind = 'react-error'): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  send(kind, message, stack ?? componentStack);
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
