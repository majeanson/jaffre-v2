import type { SeatView } from '@jaffre/engine';
import { useEffect, useRef } from 'react';

export interface RoundSummaryOverlayProps {
  readonly summary: NonNullable<SeatView['lastRoundSummary']>;
  readonly contractName: string;
}

/**
 * Owns the round-end scoreboard, shown while the table pauses between rounds.
 * It is announced as a modal dialog and takes focus on mount so screen readers
 * land on it, then hands focus back when it auto-dismisses. It never traps
 * focus: there is nothing to interact with and it closes on its own.
 */
export function RoundSummaryOverlay({ summary, contractName }: RoundSummaryOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
  const team = summary.contract.seat % 2 === 0 ? 'Team A' : 'Team B';
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
          {([0, 1] as const).map((t) => (
            <div key={t} className="rounded-lg bg-black/25 p-2">
              <p className="text-(--color-ivory)/60">Team {t === 0 ? 'A' : 'B'}</p>
              <p className="text-(--color-ivory)/80">{summary.trickPoints[t]} trick pts</p>
              <p
                className={
                  (summary.deltas[t] ?? 0) >= 0 ? 'text-(--color-ok)' : 'text-(--color-danger)'
                }
              >
                {(summary.deltas[t] ?? 0) >= 0 ? '+' : ''}
                {summary.deltas[t]}
              </p>
              <p className="font-display text-lg text-(--color-ivory)">{summary.scores[t]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-(--color-ivory)/70">Next round starting…</p>
      </div>
    </div>
  );
}
