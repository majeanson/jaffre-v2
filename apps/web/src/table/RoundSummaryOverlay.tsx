import type { SeatView } from '@jaffre/engine';
import { useEffect, useRef } from 'react';

export interface RoundSummaryOverlayProps {
  readonly summary: NonNullable<SeatView['lastRoundSummary']>;
  readonly contractName: string;
  /** Player names by absolute seat (team t = seats t and t+2). */
  readonly names: readonly string[];
  /** Per-seat readiness for the next round (bots always ready). */
  readonly readySeats: readonly boolean[];
  /** True once YOU are ready (disables the button). */
  readonly youReady: boolean;
  readonly onReady: () => void;
}

/**
 * Owns the round-end scoreboard, shown while the table pauses between rounds.
 * It is announced as a modal dialog and takes focus on mount so screen readers
 * land on it, then hands focus back when it auto-dismisses. It never traps
 * focus: there is nothing to interact with and it closes on its own.
 */
export function RoundSummaryOverlay({
  summary,
  contractName,
  names,
  readySeats,
  youReady,
  onReady,
}: RoundSummaryOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
  const team = summary.contract.seat % 2 === 0 ? 'Team Sun' : 'Team Moon';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-0 z-40 grid place-items-center bg-black/50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Round summary"
    >
      <div className="w-80 rounded-(--radius-panel) border border-(--color-accent)/40 bg-(--color-felt-800) p-6 text-center shadow-(--shadow-panel)">
        <p className="font-display text-xl text-(--color-lamplight)">
          Round {summary.roundIndex + 1}
        </p>
        <p className="mt-2 text-(--color-ivory)">
          {contractName} ({team}) {summary.contractMade ? 'MADE' : 'FAILED'}{' '}
          {summary.contract.value}
          {summary.contract.sansAtout ? ' sans atout' : ''}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm tabular-nums">
          {([0, 1] as const).map((t) => {
            const won = (summary.deltas[t] ?? 0) >= (summary.deltas[t === 0 ? 1 : 0] ?? 0);
            return (
              <div
                key={t}
                className={`rounded-lg bg-black/25 p-2 ${won ? 'ring-2' : 'opacity-80'}`}
                style={
                  won
                    ? { ['--tw-ring-color' as string]: `var(--color-team-${t === 0 ? 'a' : 'b'})` }
                    : undefined
                }
              >
                <p
                  className="font-semibold"
                  style={{ color: `var(--color-team-${t === 0 ? 'a' : 'b'})` }}
                >
                  {t === 0 ? 'Team Sun' : 'Team Moon'}
                </p>
                <p className="text-(length:--text-fluid-xs) text-(--color-ivory)/75">
                  {names[t]} & {names[t + 2]}
                </p>
                <p className="text-(--color-ivory)/80">{summary.trickPoints[t]} trick pts</p>
                <p
                  className={
                    (summary.deltas[t] ?? 0) >= 0
                      ? 'text-(--color-ok)'
                      : 'text-(--color-danger-text)'
                  }
                >
                  {(summary.deltas[t] ?? 0) >= 0 ? '+' : ''}
                  {summary.deltas[t]}
                </p>
                <p className="font-display text-lg text-(--color-ivory)">{summary.scores[t]}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onReady}
            disabled={youReady}
            className={`rounded-(--radius-panel) px-8 py-3 font-semibold text-(length:--text-fluid-base) ${
              youReady
                ? 'bg-white/10 text-(--color-ivory)/50'
                : 'bg-(--color-lamplight) text-(--color-felt-950) hover:brightness-110 active:translate-y-px cursor-pointer'
            }`}
          >
            {youReady ? 'Waiting for the others…' : 'Ready for the next round'}
          </button>
          {/* Unready stays at the base 70% ivory — dimming further fails AA. */}
          <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-(length:--text-fluid-xs) text-(--color-ivory)/70">
            {names.map((n, seat) => (
              <span key={seat} className={readySeats[seat] ? 'text-(--color-ivory)' : ''}>
                {readySeats[seat] ? '✓' : '…'} {n}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
