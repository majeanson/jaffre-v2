import type { EndReason, SeatView } from '@jaffre/engine';
import type { RosterSeat } from '@jaffre/protocol';
import { AvatarChip, Cta, StatPanel, useLang, type Lang } from '@jaffre/ui';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LinkNudge } from '../components/LinkAccount.js';
import { useScrollLock } from '../components/useScrollLock.js';
import { Confetti } from './Confetti.js';
import { STARTING_HANDS_LABEL, StartingHandsRows } from './StartingHandsPanel.js';
import { XpStrip } from './XpStrip.js';
import { DailyFirstWin } from './DailyFirstWin.js';
import { recapTakeaway } from './recapTakeaway.js';
import { TEAM_LABELS, teamLabelWithArticle } from '../teams.js';

/** Sun = seats 0 & 2 (team A), Moon = seats 1 & 3 (team B). */
const TEAM_COLOR = ['var(--color-team-a)', 'var(--color-team-b)'] as const;

const T: Record<
  Lang,
  {
    gameOver: string;
    youWin: string;
    youLose: string;
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
    tricksWon: string;
    tricksCaption: string;
    total: string;
    roundByRound: string;
    tapForHands: string;
    rd: string;
    contract: string;
    deltaSun: string;
    deltaMoon: string;
    score: string;
    rematch: string;
    swapSeats: string;
    leave: string;
    leaveTable: string;
    leaveConfirm: string;
    rating: string;
    teamLabel: (t: 0 | 1) => string;
    hailMaryWonTitle: string;
    hailMaryLostTitle: string;
    hailMaryWonMsg: (team: string) => string;
    hailMaryLostMsg: (bidder: string, winner: string) => string;
    takeaway: string;
    seeRecord: string;
  }
> = {
  en: {
    gameOver: 'Game over',
    youWin: 'You win!',
    youLose: 'You lose',
    wins: (winner) => `${TEAM_LABELS.en[winner]} wins!`,
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
    scoresCaption: 'Team scores by game',
    game: 'Game',
    gamesWon: 'Games won',
    tricksWon: 'Tricks won',
    tricksCaption: 'Tricks captured per player, one row per game',
    total: 'Total',
    roundByRound: 'Round-by-round scores',
    tapForHands: 'Tap a round to see its starting hands',
    rd: 'Rd',
    contract: 'Contract',
    deltaSun: 'Δ Sun',
    deltaMoon: 'Δ Moon',
    score: 'Score',
    rematch: 'Rematch',
    swapSeats: 'Swap seats',
    leave: 'Leave',
    leaveTable: 'Leave table',
    leaveConfirm: 'Sure? Seat frees up',
    rating: 'Rating',
    teamLabel: (t) => TEAM_LABELS.en[t],
    hailMaryWonTitle: 'Hail Mary!',
    hailMaryLostTitle: '12 sans atout — missed',
    hailMaryWonMsg: (team) => `${team} called 12 sans atout and swept it — instant win.`,
    hailMaryLostMsg: (bidder, winner) =>
      `${bidder} went for 12 sans atout and missed — ${winner} take the game.`,
    takeaway: 'One thing to work on',
    seeRecord: 'Replay it from Your record →',
  },
  fr: {
    gameOver: 'Partie terminée',
    youWin: 'Tu gagnes!',
    youLose: 'Tu perds',
    wins: (winner) => `L'${TEAM_LABELS.fr[winner]} gagne!`,
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
    scoresCaption: "Pointage d'équipe par partie",
    game: 'Partie',
    gamesWon: 'Parties gagnées',
    tricksWon: 'Levées gagnées',
    tricksCaption: 'Levées gagnées par joueur, une rangée par partie',
    total: 'Total',
    roundByRound: 'Pointage ronde par ronde',
    tapForHands: 'Touche une ronde pour voir les mains de départ',
    rd: 'R',
    contract: 'Contrat',
    deltaSun: 'Δ Soleil',
    deltaMoon: 'Δ Lune',
    score: 'Pointage',
    rematch: 'Revanche',
    swapSeats: 'Échanger les sièges',
    leave: 'Quitter',
    leaveTable: 'Quitter la table',
    leaveConfirm: 'Certain? Le siège se libère',
    rating: 'Cote',
    teamLabel: (t) => teamLabelWithArticle(t, 'fr'),
    hailMaryWonTitle: 'Coup de grâce!',
    hailMaryLostTitle: '12 sans atout — raté',
    hailMaryWonMsg: (team) =>
      `${team} a demandé 12 sans atout et a tout ramassé — victoire immédiate.`,
    hailMaryLostMsg: (bidder, winner) =>
      `${bidder} a tenté le 12 sans atout et l'a raté — ${winner} remporte la partie.`,
    takeaway: 'Une affaire à travailler',
    seeRecord: 'Rejoue-la depuis Ton record →',
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
  /** Per-seat tricks captured in each finished game (parallel to seriesGames;
   * null for a game recorded before trick tallies existed) — the individual
   * tricks scorecard. */
  readonly seriesTricks?: readonly (readonly [number, number, number, number] | null)[] | undefined;
  /** The viewer's seat (null/absent when spectating) — drives the personal
   * "You win / You lose" headline over the team line. */
  readonly mySeat?: number | null | undefined;
  /** Per-seat pixel avatars (bot sprites; your own painting), null where a
   * seat wears its plain initial chip. */
  readonly avatars?: readonly (string | null)[] | undefined;
  readonly onRematch?: (() => void) | undefined;
  /** Re-pair the table before the rematch (online rooms only). */
  readonly onSwapSeats?: (() => void) | undefined;
  readonly onLeave: () => void;
  /** Online: leaving here frees the seat for good — arm a two-tap confirm.
   * Practice leaves have nothing to lose and stay one tap. */
  readonly confirmLeave?: boolean;
  /** The viewer's own rating movement from this game — absent for spectators
   * and unrated games (a bot on either team). */
  readonly myRating?: { readonly rating: number; readonly delta: number } | undefined;
  /** How the game ended — drives the "Hail-Mary 12 sans atout" special banner. */
  readonly endReason?: EndReason | undefined;
  /** Show the viewer's XP/level strip (players only — not spectators). */
  readonly showXp?: boolean | undefined;
}

/** Two small chips for a team pair, shown under a scorepad tally. */
function PairChips({
  names,
  avatars,
  a,
  b,
}: {
  names: readonly string[];
  avatars?: readonly (string | null)[] | undefined;
  a: number;
  b: number;
}) {
  const color = TEAM_COLOR[a % 2];
  return (
    <span className="flex items-center gap-[0.35em]">
      <AvatarChip name={names[a] ?? '—'} color={color} size="sm" paint={avatars?.[a] ?? null} />
      <AvatarChip name={names[b] ?? '—'} color={color} size="sm" paint={avatars?.[b] ?? null} />
    </span>
  );
}

// On the ivory card face all text must be ink for AA; team identity rides on
// a faint background tint instead (Sun warm, Moon cool).
const TEAM_TINT = ['rgb(242 198 109 / 0.20)', 'rgb(130 199 220 / 0.24)'] as const;

const PAD_CELL = 'px-[0.3em] py-[0.45em] text-center font-arcade-display tabular-nums';
const PAD_HDR =
  'px-[0.7em] py-[0.5em] text-left font-arcade-ui text-[0.62em] font-bold uppercase tracking-[0.12em] text-(--color-ap-ink)/60';
const PAD_FRAME =
  'overflow-hidden rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-paper) text-(--color-ap-ink) shadow-(--shadow-ap-lg)';

/** The ruled between-games scorepad: one row per game, ONE column per team
 * (scores are team scores — no duplicate per-partner columns), and a "Games
 * won" footer. Ivory card face, so its text is ink (not the flipping
 * --color-ap-text). */
function Scorepad({
  games,
  names,
  avatars,
  seriesWins,
}: {
  readonly games: readonly (readonly [number, number])[];
  readonly names: readonly string[];
  readonly avatars?: readonly (string | null)[] | undefined;
  readonly seriesWins: readonly [number, number] | undefined;
}) {
  const t = T[useLang()];
  const wins = seriesWins ?? ([0, 0] as const);
  return (
    <div className={PAD_FRAME}>
      <table className="w-full border-collapse tabular-nums">
        <caption className="sr-only">{t.scoresCaption}</caption>
        <thead>
          <tr className="border-b-2 border-(--color-ap-ink)">
            <th scope="col" className={PAD_HDR}>
              {t.game}
            </th>
            {([0, 1] as const).map((team) => (
              <th
                key={team}
                scope="col"
                className={`${PAD_CELL} text-[0.78em]`}
                style={{ background: TEAM_TINT[team] }}
              >
                <span className="flex flex-col items-center gap-[0.35em]">
                  <span className="font-arcade-ui font-bold uppercase tracking-[0.1em]">
                    {team === 0 ? t.sun : t.moon}
                  </span>
                  <PairChips names={names} avatars={avatars} a={team} b={team + 2} />
                </span>
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
              {([0, 1] as const).map((team) => (
                <td
                  key={team}
                  className={`${PAD_CELL} text-[0.95em]`}
                  style={{ background: TEAM_TINT[team] }}
                >
                  {g[team]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-(--color-ap-ink)">
            <th scope="row" className={PAD_HDR}>
              {t.gamesWon}
            </th>
            {([0, 1] as const).map((team) => {
              const w = wins[team];
              const lead = w >= wins[team === 0 ? 1 : 0] && w > 0;
              return (
                <td
                  key={team}
                  className={`${PAD_CELL} text-[1em]`}
                  style={{ background: TEAM_TINT[team] }}
                >
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

/** The individual tricks scorecard: one row per game, one column per PLAYER,
 * with each player's real captured-trick count and an accumulated Total footer.
 * Games recorded before trick tallies existed show an em dash. */
function TricksPad({
  tricks,
  names,
  avatars,
}: {
  readonly tricks: readonly (readonly [number, number, number, number] | null)[];
  readonly names: readonly string[];
  readonly avatars?: readonly (string | null)[] | undefined;
}) {
  const t = T[useLang()];
  const totals = tricks.reduce<[number, number, number, number]>(
    (acc, g) => {
      if (g === null) return acc;
      for (const seat of [0, 1, 2, 3] as const) acc[seat] += g[seat];
      return acc;
    },
    [0, 0, 0, 0],
  );
  const best = Math.max(...totals);
  return (
    <div className={PAD_FRAME}>
      <table className="w-full border-collapse tabular-nums">
        <caption className="sr-only">{t.tricksCaption}</caption>
        <thead>
          <tr className="border-b-2 border-(--color-ap-ink)">
            <th scope="col" className={PAD_HDR}>
              {t.tricksWon}
            </th>
            {([0, 1, 2, 3] as const).map((seat) => (
              <th
                key={seat}
                scope="col"
                className={`${PAD_CELL}`}
                style={{ background: TEAM_TINT[seat % 2] }}
              >
                <span className="flex justify-center">
                  <AvatarChip
                    name={names[seat] ?? '—'}
                    color={TEAM_COLOR[seat % 2]}
                    size="sm"
                    paint={avatars?.[seat] ?? null}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tricks.map((g, i) => (
            <tr key={i} className="border-b border-(--color-ap-ink)/12 last:border-b-0">
              <td className="px-[0.7em] py-[0.45em] text-left font-arcade-ui text-[0.8em] text-(--color-ap-ink)/65">
                {i + 1}
              </td>
              {([0, 1, 2, 3] as const).map((seat) => (
                <td
                  key={seat}
                  className={`${PAD_CELL} text-[0.95em]`}
                  style={{ background: TEAM_TINT[seat % 2] }}
                >
                  {g === null ? '—' : g[seat]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-(--color-ap-ink)">
            <th scope="row" className={PAD_HDR}>
              {t.total}
            </th>
            {([0, 1, 2, 3] as const).map((seat) => (
              <td
                key={seat}
                className={`${PAD_CELL} text-[1em]`}
                style={{ background: TEAM_TINT[seat % 2] }}
              >
                <span
                  className={
                    totals[seat] === best && best > 0
                      ? 'inline-block rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-[0.4em] text-(--color-ap-ink)'
                      : ''
                  }
                >
                  {totals[seat]}
                </span>
              </td>
            ))}
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
  seriesTricks,
  mySeat = null,
  avatars,
  onRematch,
  onSwapSeats,
  onLeave,
  confirmLeave = false,
  endReason,
  myRating,
  showXp = false,
}: GameRecapProps) {
  const lang = useLang();
  const t = T[lang];
  // Two-tap leave (online): first tap arms the confirm, which relaxes on its
  // own so a stray tap doesn't leave the button stuck asking.
  const [leaveArmed, setLeaveArmed] = useState(false);
  useEffect(() => {
    if (!leaveArmed) return undefined;
    const timer = setTimeout(() => setLeaveArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [leaveArmed]);
  // Which round's starting hands are expanded in the round-by-round table
  // (one at a time), keyed by roundIndex; null when all are collapsed.
  const [openRound, setOpenRound] = useState<number | null>(null);
  useScrollLock();
  // Same focus contract as RoundSummaryOverlay: the hand unmounts at game
  // over, so without this a keyboard/SR user is dropped on <body> and must
  // tab blindly to find Rematch. Restore wherever focus was on unmount.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
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
  // Players only: a spectator has no record here to learn from.
  const takeaway = showXp ? recapTakeaway(rounds, mySeat ?? null, lang) : null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t.gameOver}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 outline-none"
    >
      <div className="pop-in relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) text-center font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-hero)">
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
          {/* A seated player gets the personal verdict up top — the team line
              becomes the subtitle. Spectators keep the team line as the hero. */}
          {mySeat !== null ? (
            <>
              <p
                className={`font-arcade-display text-[1.9em] uppercase leading-none ${
                  mySeat % 2 === winner ? 'text-(--color-ap-ok)' : 'text-(--color-ap-danger-text)'
                }`}
              >
                {mySeat % 2 === winner ? t.youWin : t.youLose}
              </p>
              <p
                className="mt-[0.35em] font-arcade-display text-[1.1em] uppercase leading-none"
                style={{ color: TEAM_COLOR[winner] }}
              >
                {t.wins(winner)}
              </p>
            </>
          ) : (
            <p
              className="font-arcade-display text-[1.9em] uppercase leading-none"
              style={{ color: TEAM_COLOR[winner] }}
            >
              {t.wins(winner)}
            </p>
          )}
          <div className="mt-[0.7em] flex items-center justify-center gap-[0.5em]">
            <AvatarChip
              name={names[winner] ?? '—'}
              color={TEAM_COLOR[winner]}
              paint={avatars?.[winner] ?? null}
            />
            <AvatarChip
              name={names[winner + 2] ?? '—'}
              color={TEAM_COLOR[winner]}
              paint={avatars?.[winner + 2] ?? null}
            />
          </div>
          <p className="mt-[0.5em] font-arcade-ui text-[0.95em] text-(--color-ap-text)">
            {names[winner]} & {names[winner + 2]}
          </p>
          <p className="mt-[0.2em] font-arcade-display text-[1.6em] tabular-nums text-(--color-ap-text)">
            {scores[0]} — {scores[1]}
          </p>
          {myRating !== undefined && (
            <p className="mt-[0.3em] font-arcade-ui text-[0.8em] tabular-nums text-(--color-ap-text)">
              {t.rating}: {Math.round(myRating.rating)}{' '}
              <span
                className={myRating.delta >= 0 ? 'text-(--color-ap-ok)' : 'text-(--color-suit-red)'}
              >
                ({myRating.delta >= 0 ? '+' : ''}
                {Math.round(myRating.delta)})
              </span>
            </p>
          )}
          {showXp && <XpStrip />}
          {showXp && mySeat !== null && <DailyFirstWin won={mySeat % 2 === winner} />}

          {/* Turns the recap into a learning loop: one true observation from
              this game's record, and the way back to watching it. */}
          {takeaway !== null && (
            <div
              data-testid="recap-takeaway"
              className="mt-4 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-paper-shade) px-3 py-2 text-left"
            >
              <p className={label('')}>{t.takeaway}</p>
              <p className="mt-1 text-[0.85em] leading-snug text-(--color-ap-ink)">
                {takeaway.text}
              </p>
              <a
                href="#stats"
                className="mt-1.5 inline-block text-[0.8em] text-(--color-ap-ink)/75 underline decoration-dotted underline-offset-2 hover:text-(--color-ap-ink)"
              >
                {t.seeRecord}
              </a>
            </div>
          )}

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
                <div className="mt-[0.6em] flex flex-col gap-3">
                  <Scorepad
                    games={seriesGames}
                    names={names}
                    avatars={avatars}
                    seriesWins={seriesWins}
                  />
                  {/* Individual tally: each player's real captured tricks — the
                      team pad above stays the simple game 1/2/3 tab. */}
                  {seriesTricks !== undefined && seriesTricks.some((g) => g !== null) && (
                    <TricksPad tricks={seriesTricks} names={names} avatars={avatars} />
                  )}
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
                  // The server populates `ready` at game_over too (bots always,
                  // humans while their socket is up), so this reads one field
                  // instead of guessing from isBot/connected.
                  const isReady = s?.ready ?? false;
                  const status =
                    s === null
                      ? { word: t.left, tone: 'text-(--color-ap-muted)' }
                      : isReady
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
                        <AvatarChip
                          name={s.name}
                          color={TEAM_COLOR[i % 2]}
                          paint={avatars?.[i] ?? null}
                        />
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
            // Deliberately NOT its own scroller: the modal body is the single
            // scroll surface, so the wheel behaves the same over the rounds /
            // starting hands as it does over the rest of the recap.
            <div
              role="region"
              aria-label={t.roundByRound}
              className="mt-5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.6em] text-left text-[0.8em] shadow-(--shadow-ap)"
            >
              {rounds.some((r) => r?.startingHands !== undefined) && (
                <p className="mb-1 px-1.5 text-[0.85em] text-(--color-ap-muted)">{t.tapForHands}</p>
              )}
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
                  {rounds.map((r, i) => {
                    if (r === null) return null;
                    const hands = r.startingHands;
                    const canExpand = hands !== undefined;
                    const open = openRound === r.roundIndex;
                    const toggle = () => setOpenRound(open ? null : r.roundIndex);
                    const stripe = i % 2 === 1 ? 'bg-(--color-ap-ink)/15' : '';
                    return (
                      <Fragment key={r.roundIndex}>
                        <tr
                          className={`${stripe} ${
                            canExpand
                              ? 'cursor-pointer hover:bg-(--color-ap-ink)/25 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-(--color-ap-violet)'
                              : ''
                          }`}
                          {...(canExpand
                            ? {
                                role: 'button',
                                tabIndex: 0,
                                'aria-expanded': open,
                                onClick: toggle,
                                onKeyDown: (e: KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggle();
                                  }
                                },
                              }
                            : {})}
                        >
                          <td className="px-1.5 py-1">
                            {canExpand && (
                              <span
                                aria-hidden
                                className={`mr-0.5 inline-block text-(--color-ap-muted) transition-transform ${
                                  open ? 'rotate-90' : ''
                                }`}
                              >
                                ▸
                              </span>
                            )}
                            {r.roundIndex + 1}
                          </td>
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
                        {canExpand && open && (
                          <tr className={stripe}>
                            <td colSpan={5} className="px-1.5 pb-2">
                              <div role="region" aria-label={STARTING_HANDS_LABEL[lang]}>
                                <StartingHandsRows hands={hands} names={names} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Scroll affordance: a soft fade over the body's last 2rem, so a
            table row cut at the fold reads as "scrolls" — reviewers saw the
            bare mid-row slice behind the footer as broken. */}
        <div
          aria-hidden
          className="pointer-events-none relative z-10 -mt-8 h-8 shrink-0"
          style={{ background: 'linear-gradient(to top, var(--color-ap-ground), transparent)' }}
        />
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
            <Cta
              type="button"
              variant="secondary"
              onClick={() => {
                if (!confirmLeave || leaveArmed) onLeave();
                else setLeaveArmed(true);
              }}
              className={`flex-1 ${leaveArmed ? 'border-(--color-ap-danger) text-(--color-ap-danger-text)' : ''}`}
            >
              {confirmLeave ? (leaveArmed ? t.leaveConfirm : t.leaveTable) : t.leave}
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
