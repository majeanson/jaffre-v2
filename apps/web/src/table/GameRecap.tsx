import type { EndReason, SeatView } from '@jaffre/engine';
import type { RosterSeat } from '@jaffre/protocol';
import { AvatarChip, Cta, StatPanel, useLang, type Lang } from '@jaffre/ui';
import { LinkNudge } from '../components/LinkAccount.js';
import { useScrollLock } from '../components/useScrollLock.js';
import { Confetti } from './Confetti.js';

/** Sun = seats 0 & 2 (team A), Moon = seats 1 & 3 (team B). */
const TEAM_COLOR = ['var(--color-team-a)', 'var(--color-team-b)'] as const;

const T: Record<
  Lang,
  {
    gameOver: string;
    wins: (winner: 0 | 1) => string;
    tonight: string;
    sun: string;
    moon: string;
    gamesSun: string;
    gamesMoon: string;
    stillAtTable: string;
    ready: string;
    away: string;
    left: string;
    empty: string;
    scoresCaption: string;
    game: string;
    gamesWon: string;
    roundByRound: string;
    rd: string;
    contract: string;
    deltaSun: string;
    deltaMoon: string;
    score: string;
    rematch: string;
    swapSeats: string;
    leave: string;
    teamLabel: (t: 0 | 1) => string;
    hailMaryWonTitle: string;
    hailMaryLostTitle: string;
    hailMaryWonMsg: (team: string) => string;
    hailMaryLostMsg: (bidder: string, winner: string) => string;
  }
> = {
  en: {
    gameOver: 'Game over',
    wins: (winner) => `${winner === 0 ? 'Team Sun' : 'Team Moon'} wins!`,
    tonight: 'Tonight:',
    sun: 'Sun',
    moon: 'Moon',
    gamesSun: 'Games — Sun',
    gamesMoon: 'Games — Moon',
    stillAtTable: 'Still at the table',
    ready: 'Ready',
    away: 'Away',
    left: 'Left',
    empty: 'Empty',
    scoresCaption: 'Scores by game, one column per player',
    game: 'Game',
    gamesWon: 'Games won',
    roundByRound: 'Round-by-round scores',
    rd: 'Rd',
    contract: 'Contract',
    deltaSun: 'Δ Sun',
    deltaMoon: 'Δ Moon',
    score: 'Score',
    rematch: 'Rematch',
    swapSeats: 'Swap seats',
    leave: 'Leave',
    teamLabel: (t) => (t === 0 ? 'Team Sun' : 'Team Moon'),
    hailMaryWonTitle: 'Hail Mary!',
    hailMaryLostTitle: '12 sans atout — missed',
    hailMaryWonMsg: (team) => `${team} called 12 sans atout and swept it — instant win.`,
    hailMaryLostMsg: (bidder, winner) =>
      `${bidder} went for 12 sans atout and missed — ${winner} take the game.`,
  },
  fr: {
    gameOver: 'Partie terminée',
    wins: (winner) => `L'Équipe ${winner === 0 ? 'Soleil' : 'Lune'} gagne!`,
    tonight: 'Ce soir :',
    sun: 'Soleil',
    moon: 'Lune',
    gamesSun: 'Parties — Soleil',
    gamesMoon: 'Parties — Lune',
    stillAtTable: 'Encore à la table',
    ready: 'Prêt',
    away: 'Absent',
    left: 'Parti',
    empty: 'Vide',
    scoresCaption: 'Pointage par partie, une colonne par joueur',
    game: 'Partie',
    gamesWon: 'Parties gagnées',
    roundByRound: 'Pointage ronde par ronde',
    rd: 'R',
    contract: 'Contrat',
    deltaSun: 'Δ Soleil',
    deltaMoon: 'Δ Lune',
    score: 'Pointage',
    rematch: 'Revanche',
    swapSeats: 'Échanger les sièges',
    leave: 'Quitter',
    teamLabel: (t) => (t === 0 ? "l'Équipe Soleil" : "l'Équipe Lune"),
    hailMaryWonTitle: 'Coup de grâce!',
    hailMaryLostTitle: '12 sans atout — raté',
    hailMaryWonMsg: (team) =>
      `${team} a demandé 12 sans atout et a tout ramassé — victoire immédiate.`,
    hailMaryLostMsg: (bidder, winner) =>
      `${bidder} a tenté le 12 sans atout et l'a raté — ${winner} remporte la partie.`,
  },
};

export interface GameRecapProps {
  readonly winner: 0 | 1;
  readonly scores: readonly [number, number];
  readonly rounds: readonly SeatView['lastRoundSummary'][];
  readonly names: readonly string[];
  /** Roster seats — lets the recap show who's still at the table for a rematch. */
  readonly seats?: readonly (RosterSeat | null)[] | undefined;
  /** Standing-table tally across games at this room: [Sun wins, Moon wins]. */
  readonly seriesWins?: readonly [number, number] | undefined;
  /** Final [Sun, Moon] scores of each finished game this sitting (oldest
   * first) — renders the per-game scorepad grid. */
  readonly seriesGames?: readonly (readonly [number, number])[] | undefined;
  readonly onRematch?: (() => void) | undefined;
  /** Re-pair the table before the rematch (online rooms only). */
  readonly onSwapSeats?: (() => void) | undefined;
  readonly onLeave: () => void;
  /** How the game ended — drives the "Hail-Mary 12 sans atout" special banner. */
  readonly endReason?: EndReason | undefined;
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

/** The ruled between-games scorepad: one row per game, a column per seat (team
 * scores land under both partners), and a "Games won" footer. Ivory card face,
 * so its text is ink (not the flipping --color-ap-text). */
function Scorepad({
  games,
  names,
  seriesWins,
}: {
  readonly games: readonly (readonly [number, number])[];
  readonly names: readonly string[];
  readonly seriesWins: readonly [number, number] | undefined;
}) {
  const t = T[useLang()];
  const initial = (n: string) => (n.trim()[0] ?? '—').toUpperCase();
  const cell = 'px-[0.3em] py-[0.45em] text-center font-arcade-display tabular-nums';
  // Seats 0&2 are Sun (score index 0), 1&3 Moon (index 1). Literal-index the
  // tuple so it stays a definite number under noUncheckedIndexedAccess.
  const teamOf = (seat: number) => seat % 2;
  const scoreFor = (pair: readonly [number, number], seat: number) =>
    seat % 2 === 0 ? pair[0] : pair[1];
  // On the ivory card face all text must be ink for AA; team identity rides on
  // a faint per-column background tint instead (Sun warm, Moon cool).
  const tint = (seat: number) =>
    teamOf(seat) === 0 ? 'rgb(242 198 109 / 0.20)' : 'rgb(130 199 220 / 0.24)';
  const [sunWins, moonWins] = seriesWins ?? [0, 0];
  const hdr =
    'px-[0.7em] py-[0.5em] text-left font-arcade-ui text-[0.62em] font-bold uppercase tracking-[0.12em] text-(--color-ap-ink)/60';
  return (
    <div className="overflow-hidden rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-paper) text-(--color-ap-ink) shadow-(--shadow-ap-lg)">
      <table className="w-full border-collapse tabular-nums">
        <caption className="sr-only">{t.scoresCaption}</caption>
        <thead>
          <tr className="border-b-2 border-(--color-ap-ink)">
            <th scope="col" className={hdr}>
              {t.game}
            </th>
            {[0, 1, 2, 3].map((seat) => (
              <th
                key={seat}
                scope="col"
                className={`${cell} text-[0.95em]`}
                style={{ background: tint(seat) }}
              >
                {initial(names[seat] ?? '—')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => (
            <tr key={i} className="border-b border-(--color-ap-ink)/12 last:border-b-0">
              <td className="px-[0.7em] py-[0.45em] text-left font-arcade-ui text-[0.8em] text-(--color-ap-ink)/65">
                {i + 1}
              </td>
              {[0, 1, 2, 3].map((seat) => (
                <td
                  key={seat}
                  className={`${cell} text-[0.95em]`}
                  style={{ background: tint(seat) }}
                >
                  {scoreFor(g, seat)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-(--color-ap-ink)">
            <th scope="row" className={hdr}>
              {t.gamesWon}
            </th>
            {[0, 1, 2, 3].map((seat) => {
              const w = teamOf(seat) === 0 ? sunWins : moonWins;
              const lead = w >= (teamOf(seat) === 0 ? moonWins : sunWins) && w > 0;
              return (
                <td key={seat} className={`${cell} text-[1em]`} style={{ background: tint(seat) }}>
                  <span
                    className={
                      lead
                        ? 'inline-block rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ok) px-[0.4em] text-(--color-ap-ink)'
                        : ''
                    }
                  >
                    {w}
                  </span>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Owns the end-of-game recap in the arcade product shell: the winning pair, the
 * standing-table series (per-game scorepad grid once games accumulate), who's
 * still at the table, the round-by-round breakdown, and Rematch as the hero
 * action — with Swap seats to re-pair the table between games.
 */
export function GameRecap({
  winner,
  scores,
  rounds,
  names,
  seats,
  seriesWins,
  seriesGames,
  onRematch,
  onSwapSeats,
  onLeave,
  endReason,
}: GameRecapProps) {
  const t = T[useLang()];
  useScrollLock();
  // The hail-mary ending: the last round's 12-sans-atout contract decided the
  // game. Swept → the bidding team wins; missed → the defenders take it.
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const hailMary =
    endReason === 'hailMary12' && lastRound != null
      ? {
          bidderTeam: (lastRound.contract.seat % 2) as 0 | 1,
          swept: lastRound.contractMade,
        }
      : null;
  const label = (uc: string) =>
    `font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted) ${uc}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.gameOver}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
    >
      <div className="pop-in relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) text-center font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-hero)">
        <Confetti />
        {/* Scrollable body: on a short viewport (≈900px desktop) the recap is
            taller than the screen, so the middle scrolls while the action footer
            below stays pinned — the hero Rematch is never pushed off-screen. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          {hailMary !== null && (
            <div className="mb-[0.7em] rounded-(--radius-ap-control) border-2 border-(--color-ap-gold-deep) bg-(--color-ap-gold)/15 px-3 py-2.5">
              <p className="font-arcade-display text-[1.15em] uppercase leading-tight text-(--color-ap-gold)">
                {hailMary.swept ? t.hailMaryWonTitle : t.hailMaryLostTitle}
              </p>
              <p className="mt-[0.35em] text-[0.82em] leading-snug text-(--color-ap-text)">
                {hailMary.swept
                  ? t.hailMaryWonMsg(t.teamLabel(hailMary.bidderTeam))
                  : t.hailMaryLostMsg(t.teamLabel(hailMary.bidderTeam), t.teamLabel(winner))}
              </p>
            </div>
          )}
          <p
            className="font-arcade-display text-[1.9em] uppercase leading-none"
            style={{ color: TEAM_COLOR[winner] }}
          >
            {t.wins(winner)}
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
                {t.tonight}{' '}
                <span style={{ color: TEAM_COLOR[0] }}>
                  {t.sun} {seriesWins[0]}
                </span>
                {' — '}
                <span style={{ color: TEAM_COLOR[1] }}>
                  {t.moon} {seriesWins[1]}
                </span>
              </p>
              {seriesGames !== undefined && seriesGames.length > 0 ? (
                // Per-game scorepad — the richer standing-table view once games
                // have accumulated this sitting.
                <div className="mt-[0.6em]">
                  <Scorepad games={seriesGames} names={names} seriesWins={seriesWins} />
                </div>
              ) : (
                // Fallback (first game, or a pre-scorepad room): the aggregate tally.
                <div className="mt-[0.6em] grid grid-cols-2 gap-3">
                  <StatPanel
                    value={seriesWins[0]}
                    label={t.gamesSun}
                    tone={seriesWins[0] >= seriesWins[1] ? 'gold' : 'default'}
                    sub={<PairChips names={names} a={0} b={2} />}
                  />
                  <StatPanel
                    value={seriesWins[1]}
                    label={t.gamesMoon}
                    tone={seriesWins[1] > seriesWins[0] ? 'gold' : 'default'}
                    sub={<PairChips names={names} a={1} b={3} />}
                  />
                </div>
              )}
            </div>
          )}

          {seats !== undefined && (
            <div className="mt-5 text-left">
              <p className={label('')}>{t.stillAtTable}</p>
              {/* One status chip per seat — Ready (here) / Away / Left (empty), so
                the rematch reads who's coming back at a glance. */}
              <ul className="mt-[0.6em] flex justify-between gap-2">
                {[0, 1, 2, 3].map((i) => {
                  const s = seats[i] ?? null;
                  const status =
                    s === null
                      ? { word: t.left, tone: 'text-(--color-ap-muted)' }
                      : s.connected
                        ? { word: t.ready, tone: 'text-(--color-ap-ok)' }
                        : { word: t.away, tone: 'text-(--color-ap-muted)' };
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
                        {s?.name ?? t.empty}
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
              aria-label={t.roundByRound}
              className="mt-5 max-h-56 overflow-y-auto overscroll-contain rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.6em] text-left text-[0.8em] shadow-(--shadow-ap)"
            >
              <table className="w-full tabular-nums">
                <thead className="text-(--color-ap-muted)">
                  <tr>
                    <th className="px-1.5 py-1 text-left font-normal">{t.rd}</th>
                    <th className="px-1.5 py-1 text-left font-normal">{t.contract}</th>
                    <th className="px-1.5 py-1 text-right font-normal">{t.deltaSun}</th>
                    <th className="px-1.5 py-1 text-right font-normal">{t.deltaMoon}</th>
                    <th className="px-1.5 py-1 text-right font-normal">{t.score}</th>
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
        </div>
        {/* Pinned action footer — stays visible when the body scrolls. */}
        <div className="flex flex-col items-center gap-2 border-t-2 border-(--color-ap-ink)/35 p-4">
          {onRematch !== undefined && (
            <Cta
              type="button"
              onClick={onRematch}
              className="w-full text-[1.2em] px-[1.5em] py-[0.85em]"
            >
              {t.rematch}
            </Cta>
          )}
          <div className="flex w-full items-center justify-center gap-2">
            {onSwapSeats !== undefined && (
              <Cta type="button" variant="secondary" onClick={onSwapSeats} className="flex-1">
                {t.swapSeats}
              </Cta>
            )}
            <Cta type="button" variant="secondary" onClick={onLeave} className="flex-1">
              {t.leave}
            </Cta>
          </div>
          {/* Quiet post-game moment: this record is worth keeping — link an
              account. One muted line, gone once anything is linked. */}
          <LinkNudge />
        </div>
      </div>
    </div>
  );
}
