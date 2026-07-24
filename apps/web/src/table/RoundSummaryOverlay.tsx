import type { SeatView, Suit } from '@jaffre/engine';
import {
  Cta,
  ScorePad,
  SpecialChip,
  SuitShape,
  suitName,
  useLang,
  type Lang,
  type ScoreboardRound,
  type TeamSpecials,
} from '@jaffre/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { useScrollLock } from '../components/useScrollLock.js';
import { StartingHandsInset, StartingHandsPanel } from './StartingHandsPanel.js';

const T: Record<
  Lang,
  {
    teams: readonly [string, string];
    summary: string;
    round: (n: number) => string;
    made: string;
    missed: string;
    /** Plain-language result: what happened and what it cost/earned. */
    explainMade: (name: string, bid: number, pts: number, team: string, delta: number) => string;
    explainMissed: (name: string, bid: number, pts: number, team: string, delta: number) => string;
    explainOther: (team: string, delta: number) => string;
    sansAtoutNote: string;
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
    explainMade: (name, bid, pts, team, delta) =>
      `${name} took ${pts} trick points on a bet of ${bid} — ${team} scores +${delta}.`,
    explainMissed: (name, bid, pts, team, delta) =>
      `${name} needed ${bid} but took ${pts} trick points — ${team} loses ${Math.abs(delta)}.`,
    explainOther: (team, delta) => ` ${team} takes ${delta >= 0 ? `+${delta}` : delta}.`,
    sansAtoutNote: ' No trump: stake ×2.',
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
    explainMade: (name, bid, pts, team, delta) =>
      `${name} a pris ${pts} points de levées sur une mise de ${bid} — ${team} marque +${delta}.`,
    explainMissed: (name, bid, pts, team, delta) =>
      `${name} visait ${bid} mais n'a pris que ${pts} points de levées — ${team} perd ${Math.abs(delta)}.`,
    explainOther: (team, delta) => ` ${team} prend ${delta >= 0 ? `+${delta}` : delta}.`,
    sansAtoutNote: ' Sans atout : mise ×2.',
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
  /** Every scored round so far — lets any R-row on the sheet unfold its
   * starting hands, not just the round being summarized. */
  readonly summaries: SeatView['roundSummaries'];
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
  summaries,
  myTeam,
}: RoundSummaryOverlayProps) {
  const tr = T[useLang()];
  const ref = useRef<HTMLDivElement>(null);
  useScrollLock();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);

  const contractTeam = (summary.contract.seat % 2) as 0 | 1;
  const made = summary.contractMade;

  // Any past R-row on the sheet unfolds that round's starting hands — the
  // current round keeps its dedicated panel below, so its row stays inert.
  const renderRoundDetail = (round: number): ReactNode => {
    if (round === summary.roundIndex + 1) return null;
    const hands = summaries.find((s) => s.roundIndex === round - 1)?.startingHands;
    if (hands === undefined) return null;
    return <StartingHandsInset round={round} hands={hands} names={names} />;
  };

  /** One team's big round delta with any specials it captured this round. */
  const teamDelta = (t: 0 | 1) => {
    const delta = summary.deltas[t] ?? 0;
    const sp = specials[t];
    return (
      <span className="flex items-center gap-1.5">
        <span
          className="font-arcade-display text-(length:--text-fluid-2xl) leading-none"
          style={{ color: teamColor(t) }}
        >
          {delta >= 0 ? '+' : ''}
          {delta}
        </span>
        {sp.red && <SpecialChip kind="red" />}
        {sp.brown && <SpecialChip kind="brown" />}
        {myTeam === t && <span className="sr-only">({tr.you})</span>}
      </span>
    );
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-0 z-[45] grid place-items-center bg-black/50 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={tr.summary}
    >
      <div className="max-h-[calc(100dvh-2rem)] w-[26rem] max-w-[92vw] overflow-y-auto overscroll-contain rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-6 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-hero)">
        <p className="text-center font-arcade-display text-[11px] tracking-[0.2em] text-(--color-ap-muted) uppercase">
          {tr.round(summary.roundIndex + 1)}
        </p>

        {/* Contract result headline: ✓/✗, who, made/missed, on which trump. */}
        <div className="mt-2 flex items-center justify-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-xl text-(--color-ap-ink) ${
              made ? 'bg-(--color-ap-ok)' : 'bg-(--color-ap-danger)'
            }`}
          >
            {made ? '✓' : '✗'}
          </span>
          <span className="flex items-center gap-1.5 font-arcade-display text-lg uppercase text-(--color-ap-text)">
            <span>
              {contractName} {made ? tr.made : tr.missed} {summary.contract.value}
            </span>
            <TrumpMark trump={summary.trump} sansAtout={summary.contract.sansAtout} />
          </span>
        </div>

        {/* The result, in plain words — what happened and what it cost. */}
        <p className="mx-auto mt-2 max-w-[19rem] text-center text-(length:--text-fluid-sm) leading-snug text-(--color-ap-muted)">
          {(made ? tr.explainMade : tr.explainMissed)(
            contractName,
            summary.contract.value,
            summary.trickPoints[contractTeam],
            tr.teams[contractTeam],
            summary.deltas[contractTeam] ?? 0,
          )}
          {tr.explainOther(
            tr.teams[(1 - contractTeam) as 0 | 1],
            summary.deltas[1 - contractTeam] ?? 0,
          )}
          {summary.contract.sansAtout ? tr.sansAtoutNote : ''}
        </p>

        {/* THIS round's points — the focus: two big team-coloured deltas (with
            any captured specials), fused atop the written scoresheet where the
            same round's row is highlighted. */}
        <div className="mt-4 overflow-hidden rounded-(--radius-ap-card) shadow-(--shadow-ap)">
          <div className="flex items-center justify-center gap-6 rounded-t-(--radius-ap-card) border-[3px] border-b-0 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2.5 tabular-nums">
            {teamDelta(0)}
            {/* A hairline rule splits the two teams' round scores. Uses the
                muted token so it reads on the panel in every skin (the band is
                dark in most themes, ivory-white in the light ones). */}
            <span aria-hidden className="h-7 w-px shrink-0 bg-(--color-ap-muted)/50" />
            {teamDelta(1)}
          </div>
          <ScorePad
            teamNames={tr.teams}
            scores={summary.scores}
            target={41}
            rounds={rounds}
            renderRoundDetail={renderRoundDetail}
            myTeam={myTeam}
            highlightRound={summary.roundIndex + 1}
            className="max-w-none rounded-t-none"
            shadowClass=""
          />
        </div>

        {/* The four starting hands, collapsed by default so they never crowd
            the score — tap to relive who was dealt what. */}
        {summary.startingHands !== undefined && (
          <StartingHandsPanel hands={summary.startingHands} names={names} />
        )}

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
