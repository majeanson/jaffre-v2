import type { SeatView } from '@jaffre/engine';
import type { RosterSeat } from '@jaffre/protocol';
import { AvatarChip, Cta, StatPanel } from '@jaffre/ui';
import { Confetti } from './Confetti.js';

/** Sun = seats 0 & 2 (team A), Moon = seats 1 & 3 (team B). */
const TEAM_COLOR = ['var(--color-team-a)', 'var(--color-team-b)'] as const;

export interface GameRecapProps {
  readonly winner: 0 | 1;
  readonly scores: readonly [number, number];
  readonly rounds: readonly SeatView['lastRoundSummary'][];
  readonly names: readonly string[];
  /** Roster seats — lets the recap show who's still at the table for a rematch. */
  readonly seats?: readonly (RosterSeat | null)[] | undefined;
  /** Standing-table tally across games at this room: [Sun wins, Moon wins]. */
  readonly seriesWins?: readonly [number, number] | undefined;
  readonly onRematch?: (() => void) | undefined;
  readonly onLeave: () => void;
}

/** Two small chips for a team pair, shown under a scorepad tally. */
function PairChips({ names, a, b }: { names: readonly string[]; a: number; b: number }) {
  const color = TEAM_COLOR[a % 2];
  return (
    <span className="flex items-center gap-[0.35em]">
      <AvatarChip name={names[a] ?? '—'} color={color} size="sm" />
      <AvatarChip name={names[b] ?? '—'} color={color} size="sm" />
    </span>
  );
}

/**
 * Owns the end-of-game recap in the arcade product shell: the winning pair, the
 * standing-table series as a scorepad of games (StatPanel per team), who's still
 * at the table, the round-by-round breakdown, and Rematch as the hero action.
 */
export function GameRecap({
  winner,
  scores,
  rounds,
  names,
  seats,
  seriesWins,
  onRematch,
  onLeave,
}: GameRecapProps) {
  const label = (uc: string) =>
    `font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted) ${uc}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="pop-in relative w-full max-w-md rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-6 text-center font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-hero)">
        <Confetti />
        <p
          className="font-arcade-display text-[1.9em] uppercase leading-none"
          style={{ color: TEAM_COLOR[winner] }}
        >
          {winner === 0 ? 'Team Sun' : 'Team Moon'} wins!
        </p>
        <div className="mt-[0.7em] flex items-center justify-center gap-[0.5em]">
          <AvatarChip name={names[winner] ?? '—'} color={TEAM_COLOR[winner]} />
          <AvatarChip name={names[winner + 2] ?? '—'} color={TEAM_COLOR[winner]} />
        </div>
        <p className="mt-[0.5em] font-arcade-ui text-[0.95em] text-(--color-ap-text)">
          {names[winner]} & {names[winner + 2]}
        </p>
        <p className="mt-[0.2em] font-arcade-display text-[1.6em] tabular-nums text-(--color-ap-text)">
          {scores[0]} — {scores[1]}
        </p>

        {seriesWins !== undefined && (
          <div className="mt-5 text-left">
            {/* Kept as a single <p> carrying "Tonight:" + both counts — the recap
                e2e reads this line for the standing-table tally. */}
            <p className={`${label('')} tabular-nums`}>
              Tonight: <span style={{ color: TEAM_COLOR[0] }}>Sun {seriesWins[0]}</span>
              {' — '}
              <span style={{ color: TEAM_COLOR[1] }}>Moon {seriesWins[1]}</span>
            </p>
            <div className="mt-[0.6em] grid grid-cols-2 gap-3">
              <StatPanel
                value={seriesWins[0]}
                label="Games — Sun"
                tone={seriesWins[0] >= seriesWins[1] ? 'gold' : 'default'}
                sub={<PairChips names={names} a={0} b={2} />}
              />
              <StatPanel
                value={seriesWins[1]}
                label="Games — Moon"
                tone={seriesWins[1] > seriesWins[0] ? 'gold' : 'default'}
                sub={<PairChips names={names} a={1} b={3} />}
              />
            </div>
          </div>
        )}

        {seats !== undefined && (
          <div className="mt-5 text-left">
            <p className={label('')}>Still at the table</p>
            {/* One status chip per seat — Ready (here) / Away / Left (empty), so
                the rematch reads who's coming back at a glance. */}
            <ul className="mt-[0.6em] flex justify-between gap-2">
              {[0, 1, 2, 3].map((i) => {
                const s = seats[i] ?? null;
                const status =
                  s === null
                    ? { word: 'Left', tone: 'text-(--color-ap-muted)' }
                    : s.connected
                      ? { word: 'Ready', tone: 'text-(--color-ap-ok)' }
                      : { word: 'Away', tone: 'text-(--color-ap-muted)' };
                return (
                  <li key={i} className="flex flex-col items-center gap-1.5">
                    {s === null ? (
                      <span
                        aria-hidden
                        className="grid size-[2.75em] place-items-center rounded-(--radius-ap-control) border-2 border-dashed border-(--color-ap-muted)/60 font-arcade-display text-[1.2em] text-(--color-ap-muted)"
                      >
                        —
                      </span>
                    ) : (
                      <AvatarChip name={s.name} color={TEAM_COLOR[i % 2]} />
                    )}
                    <span className="max-w-[5rem] truncate font-arcade-ui text-[0.78em] font-semibold text-(--color-ap-text)">
                      {s?.name ?? 'Empty'}
                    </span>
                    <span
                      className={`font-arcade-display text-[0.7em] uppercase tracking-wide ${status.tone}`}
                    >
                      {status.word}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {rounds.length > 0 && (
          // Keyboard-focusable so the overflow can be scrolled without a mouse.
          <div
            tabIndex={0}
            role="region"
            aria-label="Round-by-round scores"
            className="mt-5 max-h-56 overflow-y-auto rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.6em] text-left text-[0.8em] shadow-(--shadow-ap)"
          >
            <table className="w-full tabular-nums">
              <thead className="text-(--color-ap-muted)">
                <tr>
                  <th className="px-1.5 py-1 text-left font-normal">Rd</th>
                  <th className="px-1.5 py-1 text-left font-normal">Contract</th>
                  <th className="px-1.5 py-1 text-right font-normal">Δ Sun</th>
                  <th className="px-1.5 py-1 text-right font-normal">Δ Moon</th>
                  <th className="px-1.5 py-1 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody className="text-(--color-ap-text)">
                {rounds.map(
                  (r) =>
                    r !== null && (
                      <tr key={r.roundIndex} className="odd:bg-(--color-ap-ink)/15">
                        <td className="px-1.5 py-1">{r.roundIndex + 1}</td>
                        <td className="px-1.5 py-1">
                          {names[r.contract.seat]} {r.contract.value}
                          {r.contract.sansAtout ? ' SA' : ''}{' '}
                          <span
                            className={
                              r.contractMade
                                ? 'text-(--color-ap-ok)'
                                : 'text-(--color-ap-danger-text)'
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

        <div className="mt-6 flex items-center justify-center gap-3">
          {onRematch !== undefined && (
            <Cta type="button" onClick={onRematch} className="text-[1.2em] px-[1.5em] py-[0.85em]">
              Rematch
            </Cta>
          )}
          <Cta type="button" variant="secondary" onClick={onLeave}>
            Leave
          </Cta>
        </div>
      </div>
    </div>
  );
}
