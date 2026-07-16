import type { SeatView } from '@jaffre/engine';
import { SpecialChip, type TeamSpecials } from '@jaffre/ui';
import { useEffect, useRef } from 'react';

export interface RoundSummaryOverlayProps {
  readonly summary: NonNullable<SeatView['lastRoundSummary']>;
  readonly contractName: string;
  /** Player names by absolute seat (team t = seats t and t+2). */
  readonly names: readonly string[];
  /** Specials captured per team this round (red 0 → +5, brown 0 → −2). */
  readonly specials: readonly [TeamSpecials, TeamSpecials];
  /** Per-seat readiness for the next round (bots always ready). */
  readonly readySeats: readonly boolean[];
  /** True once YOU are ready (disables the button). */
  readonly youReady: boolean;
  readonly onReady: () => void;
}

const TEAM_NAME = ['Team Sun', 'Team Moon'] as const;
const teamColor = (t: 0 | 1): string => `var(--color-team-${t === 0 ? 'a' : 'b'})`;

/**
 * Owns the round-end scoreboard shown while the table waits for the next deal.
 * A modal dialog: it takes focus on mount and hands it back on close. The
 * headline reads the contract result at a glance; each team card shows its
 * trick points (with any captured specials called out), delta, and new total.
 */
export function RoundSummaryOverlay({
  summary,
  contractName,
  names,
  specials,
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

  const contractTeam = (summary.contract.seat % 2) as 0 | 1;
  const made = summary.contractMade;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Round summary"
    >
      <div className="w-[23rem] max-w-[92vw] rounded-(--radius-panel) border border-(--color-accent)/40 bg-(--color-felt-800) p-6 shadow-(--shadow-panel)">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-(--color-ivory)/70 uppercase">
          Round {summary.roundIndex + 1}
        </p>

        {/* Contract result headline: ✓/✗, who, made/missed, for which team. */}
        <div className="mt-2 flex items-center justify-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full text-xl font-black ${
              made
                ? 'bg-(--color-ok)/20 text-(--color-ok)'
                : 'bg-(--color-danger)/20 text-(--color-danger-text)'
            }`}
          >
            {made ? '✓' : '✗'}
          </span>
          <span className="text-left leading-tight">
            <span className="block font-display text-lg text-(--color-ivory)">
              {contractName} {made ? 'made' : 'missed'} {summary.contract.value}
              {summary.contract.sansAtout ? ' SA' : ''}
            </span>
            <span
              className="block text-(length:--text-fluid-xs) font-semibold"
              style={{ color: teamColor(contractTeam) }}
            >
              {TEAM_NAME[contractTeam]}
            </span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm tabular-nums">
          {([0, 1] as const).map((t) => {
            const delta = summary.deltas[t] ?? 0;
            const won = delta >= (summary.deltas[t === 0 ? 1 : 0] ?? 0);
            const sp = specials[t];
            return (
              <div
                key={t}
                className={`rounded-lg bg-black/25 p-2.5 ${won ? 'ring-2' : 'border border-white/5'}`}
                style={won ? { ['--tw-ring-color' as string]: teamColor(t) } : undefined}
              >
                <p
                  className="flex items-center justify-center gap-1.5 font-semibold"
                  style={{ color: teamColor(t) }}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: teamColor(t) }}
                  />
                  {TEAM_NAME[t]}
                </p>
                <p className="mt-0.5 text-(length:--text-fluid-xs) text-(--color-ivory)/70">
                  {names[t]} & {names[t + 2]}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1 text-(--color-ivory)/80">
                  {summary.trickPoints[t]} trick pts
                  {sp.red && <SpecialChip kind="red" />}
                  {sp.brown && <SpecialChip kind="brown" />}
                </p>
                <p
                  className="mt-1 font-display text-lg font-semibold"
                  style={{
                    color: delta >= 0 ? 'var(--color-ok)' : 'var(--color-danger-text)',
                  }}
                >
                  {delta >= 0 ? '+' : ''}
                  {delta}
                </p>
                <p className="text-(length:--text-fluid-xs) text-(--color-ivory)/55">
                  total{' '}
                  <span className="font-display text-base text-(--color-ivory)">
                    {summary.scores[t]}
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onReady}
            disabled={youReady}
            className={`w-full rounded-(--radius-panel) px-8 py-3 font-semibold text-(length:--text-fluid-base) ${
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
