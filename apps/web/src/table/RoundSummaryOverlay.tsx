import type { SeatView, Suit } from '@jaffre/engine';
import {
  Cta,
  ScorePad,
  SpecialChip,
  SuitShape,
  suitName,
  TeamGlyph,
  useLang,
  type Lang,
  type ScoreboardRound,
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
    you: string;
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
    you: 'you',
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
    you: 'toi',
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
  /** Finished rounds, oldest first — the same written scoresheet as the top bar. */
  readonly rounds: readonly ScoreboardRound[];
  /** The viewer's team (highlighted on the sheet + band), null when spectating. */
  readonly myTeam: 0 | 1 | null;
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
 * glance; below it, this round's points sit as a band fused atop the same
 * written scoresheet as the top bar, whose totals row carries the game score.
 */
export function RoundSummaryOverlay({
  summary,
  contractName,
  names,
  specials,
  readySeats,
  youReady,
  onReady,
  rounds,
  myTeam,
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

        {/* This round's points as a band fused atop the SAME written scoresheet
            as the top bar — the round delta and the game totals read as one
            sheet, never two competing scores. */}
        <div className="mt-4">
          <div className="grid grid-cols-2 overflow-hidden rounded-t-(--radius-ap-card) border-[3px] border-b-0 border-(--color-ap-ink) bg-(--color-ap-panel) text-center text-sm tabular-nums">
            {([0, 1] as const).map((t) => {
              const delta = summary.deltas[t] ?? 0;
              const sp = specials[t];
              const mine = myTeam === t;
              return (
                <div
                  key={t}
                  className={`flex flex-col items-center gap-0.5 p-2.5 ${
                    t === 1 ? 'border-l-2 border-(--color-ap-ink)/40' : ''
                  } ${mine ? 'bg-(--color-ap-violet)/15 ring-2 ring-inset ring-(--color-ap-violet)' : ''}`}
                >
                  <p className="flex items-center justify-center gap-1.5">
                    <TeamGlyph team={t} size="1.2em" label={tr.teams[t]} />
                    {mine && <span className="sr-only">({tr.you})</span>}
                  </p>
                  <p className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                    {names[t]} & {names[t + 2]}
                  </p>
                  <p className="flex flex-wrap items-center justify-center gap-1 text-(length:--text-fluid-xs) text-(--color-ap-text)/85">
                    {tr.trickPts(summary.trickPoints[t])}
                    {sp.red && <SpecialChip kind="red" />}
                    {sp.brown && <SpecialChip kind="brown" />}
                  </p>
                  <p className="font-arcade-display text-xl" style={{ color: teamColor(t) }}>
                    {delta >= 0 ? '+' : ''}
                    {delta}
                  </p>
                </div>
              );
            })}
          </div>
          <ScorePad
            teamNames={tr.teams}
            scores={summary.scores}
            target={41}
            rounds={rounds}
            myTeam={myTeam}
            className="max-w-none rounded-t-none"
          />
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
