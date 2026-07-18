import type { SeatView, Suit } from '@jaffre/engine';
import {
  Cta,
  SpecialChip,
  SuitShape,
  suitName,
  TeamGlyph,
  useLang,
  type Lang,
  type TeamSpecials,
} from '@jaffre/ui';
import { useEffect, useRef } from 'react';

const T: Record<
  Lang,
  {
    teams: readonly [string, string];
    summary: string;
    round: (n: number) => string;
    made: string;
    missed: string;
    trickPts: (n: number) => string;
    thisRound: string;
    gameTotal: string;
    noTrump: string;
    trumpTitle: (suit: string) => string;
    waiting: string;
    ready: string;
  }
> = {
  en: {
    teams: ['Team Sun', 'Team Moon'],
    summary: 'Round summary',
    round: (n) => `Round ${n}`,
    made: 'made',
    missed: 'missed',
    trickPts: (n) => `${n} trick pts`,
    thisRound: 'This round',
    gameTotal: 'Game total',
    noTrump: 'No trump',
    trumpTitle: (suit) => `Trump: ${suit}`,
    waiting: 'Waiting for the others…',
    ready: 'Ready for the next round',
  },
  fr: {
    teams: ['Équipe Soleil', 'Équipe Lune'],
    summary: 'Résumé de la ronde',
    round: (n) => `Ronde ${n}`,
    made: 'réussit',
    missed: 'rate',
    trickPts: (n) => `${n} pts de levées`,
    thisRound: 'Cette ronde',
    gameTotal: 'Total de la partie',
    noTrump: 'Sans atout',
    trumpTitle: (suit) => `Atout : ${suit}`,
    waiting: 'On attend les autres…',
    ready: 'Prêt pour la prochaine ronde',
  },
};

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

const teamColor = (t: 0 | 1): string => `var(--color-team-${t === 0 ? 'a' : 'b'})`;

/** The trump that drove the bet: the suit mark, or a gold "SA" for sans-atout. */
function TrumpMark({ trump, sansAtout }: { trump: Suit | null; sansAtout: boolean }) {
  const lang = useLang();
  const tr = T[lang];
  if (sansAtout || trump === null) {
    return (
      <span
        title={tr.noTrump}
        className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-1.5 font-arcade-display text-[0.8em] tracking-wide text-(--color-ap-gold-deep)"
      >
        SA<span className="sr-only"> — {tr.noTrump}</span>
      </span>
    );
  }
  return (
    <span
      title={tr.trumpTitle(suitName(trump, lang))}
      className="grid size-[1.7em] place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel)"
    >
      <SuitShape suit={trump} size="0.95em" />
      <span className="sr-only">{tr.trumpTitle(suitName(trump, lang))}</span>
    </span>
  );
}

/**
 * Owns the round-end scoreboard shown while the table waits for the next deal.
 * A modal dialog: it takes focus on mount and hands it back on close. The
 * headline reads the contract result — with the trump that drove it — at a
 * glance; each team card separates the points won THIS ROUND from the running
 * GAME TOTAL as two ruled rows, so the round delta never reads as the total.
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
  const tr = T[useLang()];
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
      aria-label={tr.summary}
    >
      <div className="w-[23rem] max-w-[92vw] rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-6 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-hero)">
        <p className="text-center font-arcade-display text-[11px] tracking-[0.2em] text-(--color-ap-muted) uppercase">
          {tr.round(summary.roundIndex + 1)}
        </p>

        {/* Contract result headline: ✓/✗, who, made/missed, for which team, on
            which trump. */}
        <div className="mt-2 flex items-center justify-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-xl text-(--color-ap-ink) ${
              made ? 'bg-(--color-ap-ok)' : 'bg-(--color-ap-danger)'
            }`}
          >
            {made ? '✓' : '✗'}
          </span>
          <span className="text-left leading-tight">
            <span className="flex items-center gap-1.5 font-arcade-display text-lg uppercase text-(--color-ap-text)">
              <span>
                {contractName} {made ? tr.made : tr.missed} {summary.contract.value}
              </span>
              <TrumpMark trump={summary.trump} sansAtout={summary.contract.sansAtout} />
            </span>
            {/* Team colour flips WITH the skin, staying legible on the ground. */}
            <span
              className="mt-0.5 flex items-center gap-1.5 text-(length:--text-fluid-xs) font-semibold"
              style={{ color: teamColor(contractTeam) }}
            >
              <TeamGlyph team={contractTeam} size="1em" label={tr.teams[contractTeam]} />
              {tr.teams[contractTeam]}
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
                className={`rounded-(--radius-ap-panel) border-2 bg-(--color-ap-panel) p-2.5 ${won ? 'border-(--color-ap-ink) ring-2' : 'border-(--color-ap-ink)'}`}
                style={won ? { ['--tw-ring-color' as string]: teamColor(t) } : undefined}
              >
                <p
                  className="flex items-center justify-center gap-1.5 font-semibold"
                  style={{ color: teamColor(t) }}
                >
                  <TeamGlyph team={t} size="1em" />
                  {tr.teams[t]}
                </p>
                <p className="mt-0.5 text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  {names[t]} & {names[t + 2]}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1 text-(--color-ap-text)/85">
                  {tr.trickPts(summary.trickPoints[t])}
                  {sp.red && <SpecialChip kind="red" />}
                  {sp.brown && <SpecialChip kind="brown" />}
                </p>

                {/* Round delta vs game total, as two labelled ruled rows so the
                    +delta never reads as the running score. Neutral ink for AA
                    on the flipping panel; made/missed lives in the headline. */}
                <dl className="mt-2 border-t-2 border-(--color-ap-ink)/25 pt-1.5 text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                      {tr.thisRound}
                    </dt>
                    <dd className="font-arcade-display text-lg text-(--color-ap-text)">
                      {delta >= 0 ? '+' : ''}
                      {delta}
                    </dd>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2 border-t border-(--color-ap-ink)/15 pt-0.5">
                    <dt className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                      {tr.gameTotal}
                    </dt>
                    <dd className="font-arcade-display text-base text-(--color-ap-text)">
                      {summary.scores[t]}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Cta type="button" onClick={onReady} disabled={youReady} className="w-full">
            {youReady ? tr.waiting : tr.ready}
          </Cta>
          <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-(length:--text-fluid-xs) text-(--color-ap-muted)">
            {names.map((n, seat) => (
              <span key={seat} className={readySeats[seat] ? 'text-(--color-ap-text)' : ''}>
                {readySeats[seat] ? '✓' : '…'} {n}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
