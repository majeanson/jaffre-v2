import type { SeatView } from '@jaffre/engine';
import { Confetti } from './Confetti.js';

export interface GameRecapProps {
  readonly winner: 0 | 1;
  readonly scores: readonly [number, number];
  readonly rounds: readonly SeatView['lastRoundSummary'][];
  readonly names: readonly string[];
  /** Standing-table tally across games at this room: [Sun wins, Moon wins]. */
  readonly seriesWins?: readonly [number, number] | undefined;
  readonly onRematch?: (() => void) | undefined;
  readonly onLeave: () => void;
}

/** Owns the end-of-game recap: winner, round-by-round breakdown, rematch or leave. */
export function GameRecap({
  winner,
  scores,
  rounds,
  names,
  seriesWins,
  onRematch,
  onLeave,
}: GameRecapProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="pop-in relative w-full max-w-md rounded-(--radius-panel) border border-(--color-accent)/40 bg-(--color-felt-800) p-6 text-center shadow-(--shadow-panel)">
        <Confetti />
        <p
          className="font-display text-(length:--text-fluid-2xl)"
          style={{ color: `var(--color-team-${winner === 0 ? 'a' : 'b'})` }}
        >
          {winner === 0 ? 'Team Sun' : 'Team Moon'} wins!
        </p>
        <p className="mt-0.5 font-semibold text-(length:--text-fluid-base) text-(--color-ivory)">
          {names[winner]} & {names[winner + 2]}
        </p>
        <p className="mt-1 text-(--color-ivory)/80 tabular-nums">
          {scores[0]} — {scores[1]}
        </p>
        {seriesWins !== undefined && (
          <p className="mt-1 text-xs text-(--color-ivory)/55 tabular-nums">
            Tonight: <span style={{ color: 'var(--color-team-a)' }}>Sun {seriesWins[0]}</span>
            {' — '}
            <span style={{ color: 'var(--color-team-b)' }}>Moon {seriesWins[1]}</span>
          </p>
        )}

        {rounds.length > 0 && (
          // Keyboard-focusable so the overflow can be scrolled without a mouse.
          <div
            tabIndex={0}
            role="region"
            aria-label="Round-by-round scores"
            className="mt-4 max-h-56 overflow-y-auto rounded-lg bg-black/25 p-2 text-left text-xs"
          >
            <table className="w-full tabular-nums">
              <thead className="text-(--color-ivory)/75">
                <tr>
                  <th className="px-1.5 py-1 text-left font-normal">Rd</th>
                  <th className="px-1.5 py-1 text-left font-normal">Contract</th>
                  <th className="px-1.5 py-1 text-right font-normal">Δ Sun</th>
                  <th className="px-1.5 py-1 text-right font-normal">Δ Moon</th>
                  <th className="px-1.5 py-1 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody className="text-(--color-ivory)/85">
                {rounds.map(
                  (r) =>
                    r !== null && (
                      <tr key={r.roundIndex} className="odd:bg-white/4">
                        <td className="px-1.5 py-1">{r.roundIndex + 1}</td>
                        <td className="px-1.5 py-1">
                          {names[r.contract.seat]} {r.contract.value}
                          {r.contract.sansAtout ? ' SA' : ''}{' '}
                          <span
                            className={
                              r.contractMade ? 'text-(--color-ok)' : 'text-(--color-danger-text)'
                            }
                          >
                            {r.contractMade ? '✓' : '✗'}
                          </span>
                        </td>
                        <td className="px-1.5 py-1 text-right">{r.deltas[0]}</td>
                        <td className="px-1.5 py-1 text-right">{r.deltas[1]}</td>
                        <td className="px-1.5 py-1 text-right">
                          {r.scores[0]}–{r.scores[1]}
                        </td>
                      </tr>
                    ),
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-center gap-3">
          {onRematch !== undefined && (
            <button
              onClick={onRematch}
              className="rounded-(--radius-panel) bg-(--color-lamplight) px-6 py-3 font-semibold text-(--color-felt-950) hover:brightness-110 active:translate-y-px cursor-pointer"
            >
              Rematch
            </button>
          )}
          <button
            onClick={onLeave}
            className="rounded-(--radius-panel) border border-white/20 px-6 py-3 font-semibold text-(--color-ivory)/90 hover:bg-white/8 cursor-pointer"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
