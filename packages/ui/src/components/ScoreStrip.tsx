import { useState, type ReactNode } from 'react';
import { suitName, useLang, type Lang } from '../i18n.js';
import type { SuitId } from '../types.js';
import { SuitShape } from './SuitShape.js';
import { TeamGlyph } from './TeamGlyph.js';

const T: Record<
  Lang,
  {
    redChip: string;
    brownChip: string;
    pile: (label: string, count: number, points: number, red: boolean, brown: boolean) => string;
    betMade: string;
    betMissed: string;
    scoreboard: string;
    round: string;
    bet: string;
    bidding: string;
    noRounds: string;
    total: string;
    firstTo: (target: number) => string;
    noTrump: string;
    trumpTitle: (suit: string) => string;
    trumpSr: (suit: string) => string;
    scoreDetails: string;
    dismissScore: string;
    you: string;
    noBetYet: string;
    mustTake: string;
    trickPoints: string;
    noTrumpStake: string;
  }
> = {
  en: {
    redChip: 'Red 0 captured · +5',
    brownChip: 'Brown 0 captured · −2',
    pile: (label, count, points, red, brown) =>
      `${label}: ${count} trick${count === 1 ? '' : 's'}, ${points} points this round${
        red ? ', captured the red 0 for +5' : ''
      }${brown ? ', captured the brown 0 for −2' : ''}`,
    betMade: 'Bet made',
    betMissed: 'Bet missed',
    scoreboard: 'Round-by-round scoreboard',
    round: 'Round',
    bet: 'Bet',
    bidding: 'bidding…',
    noRounds: 'no rounds played yet',
    total: 'Total',
    firstTo: (target) => `first to ${target}`,
    noTrump: 'No\u00A0trump',
    trumpTitle: (suit) => `Trump: ${suit}`,
    trumpSr: (suit) => `Trump ${suit}`,
    scoreDetails: 'Score details',
    dismissScore: 'Dismiss',
    you: 'you',
    noBetYet: 'no bet yet',
    mustTake: 'must take',
    trickPoints: 'trick points',
    noTrumpStake: ' with no trump (stake ×2)',
  },
  fr: {
    redChip: 'Zéro rouge capturé · +5',
    brownChip: 'Zéro brun capturé · −2',
    pile: (label, count, points, red, brown) =>
      `${label} : ${count} levée${count === 1 ? '' : 's'}, ${points} points cette ronde${
        red ? ', a capturé le zéro rouge pour +5' : ''
      }${brown ? ', a capturé le zéro brun pour −2' : ''}`,
    betMade: 'Mise réussie',
    betMissed: 'Mise ratée',
    scoreboard: 'Pointage ronde par ronde',
    round: 'Ronde',
    bet: 'Mise',
    bidding: 'mises en cours…',
    noRounds: 'aucune ronde jouée',
    total: 'Total',
    firstTo: (target) => `premier à ${target}`,
    noTrump: 'Sans\u00A0atout',
    trumpTitle: (suit) => `Atout : ${suit}`,
    trumpSr: (suit) => `Atout ${suit}`,
    scoreDetails: 'Détails du pointage',
    dismissScore: 'Fermer',
    you: 'toi',
    noBetYet: 'pas encore de mise',
    mustTake: 'doit prendre',
    trickPoints: 'points de levées',
    noTrumpStake: ' sans atout (mise ×2)',
  },
};

/** Which scoring specials a team has captured this round. */
export interface TeamSpecials {
  readonly red: boolean; // the red 0 (+5)
  readonly brown: boolean; // the brown 0 (−2)
}

/** One finished round on the written scoreboard. */
export interface ScoreboardRound {
  /** 1-based round number, as written on the pad ("R3"). */
  readonly round: number;
  readonly bidderName: string;
  readonly bidderTeam: 0 | 1;
  readonly bid: number;
  readonly sansAtout: boolean;
  /** The trump suit that drove the round; null for a sans-atout bet. */
  readonly trump: SuitId | null;
  readonly made: boolean;
  /** Points each team gained (or lost) this round. */
  readonly deltas: readonly [number, number];
}

export interface ScoreStripProps {
  readonly teamNames: readonly [string, string];
  readonly scores: readonly [number, number];
  readonly target: number;
  readonly contract?: {
    readonly playerName: string;
    readonly value: number;
    readonly sansAtout: boolean;
    /** Trick points the contract team has taken so far this round. */
    readonly progress?: number;
    /** Bidder's team, colors the bet on the written scoreboard. */
    readonly team?: 0 | 1;
  } | null;
  /** Finished rounds, oldest first — the written scoreboard rows. */
  readonly rounds?: readonly ScoreboardRound[];
  /** 1-based number of the round in progress (omit once the game is over). */
  readonly currentRound?: number | undefined;
  readonly trump?: SuitId | null;
  readonly trumpDecided?: boolean;
  /** Trick points per team this round (expanded view). */
  readonly roundPoints?: readonly [number, number];
  /** Tricks captured per team this round (expanded view). */
  readonly trickCounts?: readonly [number, number];
  /** Specials captured per team this round — shown as chips on the piles. */
  readonly specials?: readonly [TeamSpecials, TeamSpecials];
  /** The current turn/phase, e.g. "Marcel to play" — the center headline. */
  readonly action?: string;
  /** App controls (leave, skin, log…) shown only while expanded. */
  readonly actions?: ReactNode;
  /** The viewer's own team (seat parity), highlighted so you know your side. */
  readonly myTeam?: 0 | 1 | null;
  /** Mount with the details panel already expanded (scene viewer). */
  readonly defaultDetailsOpen?: boolean;
}

/** "Team Sun" / « Équipe Soleil » → "Sun" / « Soleil »: the dot already
 * carries the team identity. */
const shortName = (name: string): string => name.replace(/^(team|équipe)\s+/i, '');

const TEAM_VARS = ['var(--color-team-a)', 'var(--color-team-b)'] as const;
/** Deep team colours that meet AA on the ivory scorepad's cream header in BOTH
 * skins (the felt team vars are light in the dark skin and vanish on cream). */
const TEAM_INK = ['#8a5c00', '#1c5f78'] as const;

/** A captured special: the +5 red 0 or the −2 brown 0, in its suit color. */
export function SpecialChip({ kind }: { kind: 'red' | 'brown' }) {
  const t = T[useLang()];
  const isRed = kind === 'red';
  return (
    <span
      title={isRed ? t.redChip : t.brownChip}
      className={`rounded-(--radius-ap-inner) border-2 bg-(--color-ap-ink) px-1 font-arcade-display text-[9px] leading-tight text-white ${
        isRed ? 'border-(--color-suit-red)' : 'border-(--color-suit-brown)'
      }`}
    >
      {isRed ? '+5' : '−2'}
    </span>
  );
}

/**
 * One team's tricks this round: a pile of face-down mini cards, the round
 * points, and any captured specials called out in their own suit color.
 */
function TrickPile({
  count,
  points,
  special,
  colorVar,
  label,
  mirrored = false,
}: {
  count: number;
  points: number;
  special?: TeamSpecials | undefined;
  colorVar: string;
  label: string;
  mirrored?: boolean;
}) {
  const t = T[useLang()];
  const shown = Math.min(count, 8);
  return (
    <span
      className={`flex items-center gap-1.5 rounded-(--radius-ap-inner) bg-(--color-ap-ink)/15 px-1.5 py-1 ${mirrored ? 'flex-row-reverse' : ''}`}
      aria-label={t.pile(label, count, points, special?.red === true, special?.brown === true)}
    >
      {/* The mini-card stack needs width a phone doesn't have — there the
          points + special chips alone tell the story. */}
      <span
        className={`flex items-center max-sm:hidden ${mirrored ? 'flex-row-reverse -space-x-1.5 space-x-reverse' : '-space-x-1.5'}`}
        aria-hidden
      >
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className="pop-in inline-block h-[1.5em] w-[1.05em] rounded-[3px] border-2 bg-(--color-card-back) shadow-(--shadow-ap-sm)"
            style={{ borderColor: colorVar }}
          />
        ))}
        {count === 0 && (
          <span className="inline-block h-[1.5em] w-[1.05em] rounded-[3px] border-2 border-dashed border-(--color-ap-muted)/40" />
        )}
      </span>
      <span
        className="min-w-[1.5em] text-center font-arcade-display tabular-nums"
        style={{ color: colorVar }}
        aria-hidden
      >
        {points > 0 ? '+' : ''}
        {points}
      </span>
      {(special?.red ?? false) || (special?.brown ?? false) ? (
        <span
          className={`flex items-center gap-0.5 ${mirrored ? 'flex-row-reverse' : ''}`}
          aria-hidden
        >
          {special?.red === true && <SpecialChip kind="red" />}
          {special?.brown === true && <SpecialChip kind="brown" />}
        </span>
      ) : null}
    </span>
  );
}

/** One team's half of the scoreboard: sun/moon token + score + race bar. */
function TeamSide({
  name,
  team,
  score,
  target,
  count,
  points,
  special,
  colorVar,
  mirrored = false,
  isMine = false,
  youLabel,
  testId,
}: {
  name: string;
  team: 0 | 1;
  score: number;
  target: number;
  count: number;
  points: number;
  special?: TeamSpecials | undefined;
  colorVar: string;
  mirrored?: boolean;
  /** This is the viewer's team — mark it so you always know your side. */
  isMine?: boolean;
  youLabel: string;
  testId: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / target) * 100));
  return (
    <span
      className={`flex min-w-0 items-center gap-2.5 max-sm:gap-1.5 ${mirrored ? 'flex-row-reverse' : ''} ${
        // Your team's whole side glows instead of wearing a "you" chip.
        isMine
          ? 'rounded-(--radius-ap-inner) bg-(--color-ap-violet)/15 px-1.5 py-0.5 ring-2 ring-(--color-ap-violet)'
          : 'px-1.5 py-0.5'
      }`}
    >
      <span className="flex flex-col items-center gap-0.5 leading-none">
        {/* The glyph alone carries the team identity — no SUN/MOON words. */}
        <span className="flex items-center gap-[0.4em]">
          <TeamGlyph team={team} size="1.2em" label={name} />
          {isMine && <span className="sr-only">({youLabel})</span>}
        </span>
        <span
          data-testid={testId}
          className="font-arcade-display text-(length:--text-fluid-lg) tabular-nums"
          style={{ color: colorVar }}
        >
          <span key={score} className="score-flash inline-block">
            {score}
          </span>
        </span>
        <span
          aria-hidden
          className="h-1 w-[3.2em] overflow-hidden rounded-full border border-(--color-ap-ink) bg-(--color-ap-ink)/20"
        >
          <span
            className="block h-full"
            style={{ width: `${String(pct)}%`, background: colorVar }}
          />
        </span>
      </span>
      <TrickPile
        count={count}
        points={points}
        special={special}
        colorVar={colorVar}
        label={name}
        mirrored={mirrored}
      />
    </span>
  );
}

const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));

/** The trump that drove the bet, on the ivory pad: the suit mark, or a gold
 * `*` for a sans-atout contract (no trump — stake ×2). */
function BetTrump({ trump, sansAtout }: { trump: SuitId | null; sansAtout: boolean }) {
  const lang = useLang();
  const t = T[lang];
  if (sansAtout) {
    return (
      <span
        title={t.noTrump}
        className="font-arcade-display text-(--color-ap-gold-deep)"
        aria-hidden
      >
        *<span className="sr-only">{t.noTrump}</span>
      </span>
    );
  }
  if (trump === null) return null;
  return (
    <span title={t.trumpTitle(suitName(trump, lang))} className="inline-flex shrink-0 align-middle">
      <SuitShape suit={trump} size="0.85em" />
      <span className="sr-only">{t.trumpSr(suitName(trump, lang))}</span>
    </span>
  );
}

/** "Marcel 8 ♦" with a suit-dot team mark and a made/missed tick — on ivory. */
function BetCell({
  name,
  team,
  bid,
  sansAtout,
  trump = null,
  made,
}: {
  name: string;
  team: 0 | 1;
  bid: number;
  sansAtout: boolean;
  trump?: SuitId | null;
  made?: boolean | undefined;
}) {
  const t = T[useLang()];
  return (
    <span className="flex items-center justify-end gap-1 whitespace-nowrap">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: TEAM_INK[team] }}
        aria-hidden
      />
      <span className="truncate text-(--color-ap-ink)/85">
        {name} <span className="font-arcade-display">{bid}</span>
      </span>
      <BetTrump trump={trump} sansAtout={sansAtout} />
      {made !== undefined && (
        <span
          className={made ? 'text-(--color-suit-green)' : 'text-(--color-suit-red)'}
          title={made ? t.betMade : t.betMissed}
        >
          {made ? '✓' : '✗'}
        </span>
      )}
    </span>
  );
}

/**
 * The classic written scoreboard on an ivory ruled pad: one row per round with
 * each team's points and the bet that drove them, a live row for the round
 * underway, and the running totals across the bottom. Ivory face → ink text.
 */
export function ScorePad({
  teamNames,
  scores,
  target,
  rounds,
  currentRound,
  roundPoints,
  contract,
  trump = null,
  myTeam = null,
  className = '',
}: {
  teamNames: readonly [string, string];
  scores: readonly [number, number];
  target: number;
  rounds: readonly ScoreboardRound[];
  currentRound?: number | undefined;
  roundPoints?: readonly [number, number] | undefined;
  contract?: ScoreStripProps['contract'] | undefined;
  /** The trump decided for the round in progress (live row); null if undecided. */
  trump?: SuitId | null;
  myTeam?: 0 | 1 | null;
  /** Extra classes on the pad root (e.g. to fuse it under a header band). */
  className?: string;
}) {
  const t = T[useLang()];
  const liveRound =
    currentRound !== undefined && !rounds.some((r) => r.round === currentRound)
      ? currentRound
      : null;

  const cols = (
    <colgroup>
      <col className="w-14" />
      <col className="w-[19%]" />
      <col className="w-[19%]" />
      <col />
    </colgroup>
  );

  const deltaCell = (d: number) => (
    <span
      className={`font-arcade-display ${d < 0 ? 'text-(--color-suit-red)' : 'text-(--color-ap-ink)'}`}
    >
      {signed(d)}
    </span>
  );

  const headCell =
    'py-1.5 font-arcade-ui text-[0.85em] font-bold tracking-[0.12em] uppercase text-(--color-ap-ink)/70';

  return (
    <div
      className={`w-full max-w-md overflow-hidden rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-card-face) text-(--color-ap-ink) shadow-(--shadow-ap) ${className}`}
    >
      <div
        tabIndex={0}
        role="region"
        aria-label={t.scoreboard}
        className="max-h-52 overflow-y-auto"
        style={{
          backgroundImage:
            'repeating-linear-gradient(transparent 0 27px, rgb(11 7 19 / 0.06) 27px 28px)',
        }}
      >
        <table className="w-full table-fixed tabular-nums" data-testid="scorepad">
          <caption className="sr-only">{t.scoreboard}</caption>
          {cols}
          <thead className="sticky top-0 border-b-2 border-(--color-ap-ink) bg-[#efe6cf]">
            <tr>
              <th scope="col" className={`${headCell} pl-3 text-left`}>
                {t.round}
              </th>
              {([0, 1] as const).map((team) => (
                <th
                  key={team}
                  scope="col"
                  className={`py-1.5 text-center font-arcade-ui text-[0.85em] font-bold tracking-[0.1em] uppercase ${
                    team === myTeam ? 'underline decoration-2 underline-offset-2' : ''
                  }`}
                  style={{ color: TEAM_INK[team] }}
                >
                  <span className="mr-1 inline-flex align-middle">
                    <TeamGlyph team={team} size="0.9em" color={TEAM_INK[team]} />
                  </span>
                  {shortName(teamNames[team])}
                </th>
              ))}
              <th scope="col" className={`${headCell} pr-3 text-right`}>
                {t.bet}
              </th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.round} className="border-b border-(--color-ap-ink)/10 last:border-0">
                <td className="py-1 pl-3 text-left font-arcade-ui text-(--color-ap-ink)/60">
                  R{r.round}
                </td>
                <td className="py-1 text-center">{deltaCell(r.deltas[0])}</td>
                <td className="py-1 text-center">{deltaCell(r.deltas[1])}</td>
                <td className="py-1 pr-3 text-right">
                  <BetCell
                    name={r.bidderName}
                    team={r.bidderTeam}
                    bid={r.bid}
                    sansAtout={r.sansAtout}
                    trump={r.trump}
                    made={r.made}
                  />
                </td>
              </tr>
            ))}
            {liveRound !== null && (
              <tr className="text-(--color-ap-ink)/55">
                <td className="py-1 pl-3 text-left font-arcade-ui">R{liveRound}</td>
                <td className="py-1 text-center font-arcade-display">
                  {signed(roundPoints?.[0] ?? 0)}
                </td>
                <td className="py-1 text-center font-arcade-display">
                  {signed(roundPoints?.[1] ?? 0)}
                </td>
                <td className="py-1 pr-3 text-right">
                  {contract != null ? (
                    <BetCell
                      name={contract.playerName}
                      team={contract.team ?? 0}
                      bid={contract.value}
                      sansAtout={contract.sansAtout}
                      trump={trump}
                    />
                  ) : (
                    <span className="italic">{t.bidding}</span>
                  )}
                </td>
              </tr>
            )}
            {rounds.length === 0 && liveRound === null && (
              <tr className="text-(--color-ap-ink)/50">
                <td colSpan={4} className="py-2 text-center italic">
                  {t.noRounds}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center border-t-2 border-(--color-ap-ink) bg-[#efe6cf]">
        <table className="w-full table-fixed tabular-nums">
          {cols}
          <tbody>
            <tr>
              <td className={`${headCell} pl-3 text-left`}>{t.total}</td>
              {([0, 1] as const).map((team) => (
                <td
                  key={team}
                  className="py-1.5 text-center font-arcade-display text-[1.3em]"
                  style={{ color: TEAM_INK[team] }}
                >
                  {scores[team]}
                </td>
              ))}
              <td className="py-1.5 pr-3 text-right font-arcade-ui text-[0.85em] text-(--color-ap-ink)/70">
                {t.firstTo(target)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The trump suit, called out with its mark + color — the key fact of the round. */
function TrumpBadge({ trump, trumpDecided }: { trump: SuitId | null; trumpDecided: boolean }) {
  const lang = useLang();
  const t = T[lang];
  if (!trumpDecided) return null;
  if (trump === null) {
    return (
      <span className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.5em] py-[0.15em] font-arcade-display text-[0.6em] tracking-wide text-(--color-ap-text) uppercase">
        {t.noTrump}
      </span>
    );
  }
  return (
    <span
      title={t.trumpTitle(suitName(trump, lang))}
      className="grid size-[1.7em] place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel)"
    >
      <SuitShape suit={trump} size="0.9em" />
      <span className="sr-only">{t.trumpSr(suitName(trump, lang))}</span>
    </span>
  );
}

/**
 * The top bar, read as a scoreboard: each team's side (token, game score, race
 * bar) with its round trick tray, and a center that shows only what matters
 * right now — whose turn it is, the bet, and the trump. Tap to expand for full
 * details and the app controls.
 */
export function ScoreStrip({
  teamNames,
  scores,
  target,
  contract = null,
  trump = null,
  trumpDecided = false,
  roundPoints,
  trickCounts,
  specials,
  rounds = [],
  currentRound,
  action,
  actions,
  myTeam = null,
  defaultDetailsOpen = false,
}: ScoreStripProps) {
  const t = T[useLang()];
  const [open, setOpen] = useState(defaultDetailsOpen);

  return (
    <div className="relative w-fit max-w-full min-w-[min(22rem,94vw)] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) font-arcade-ui text-(length:--text-fluid-sm) shadow-(--shadow-ap)">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t.scoreDetails}
        onClick={() => setOpen((o) => !o)}
        className="relative z-40 grid w-full cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-3.5 py-1.5 max-sm:gap-x-2 max-sm:px-2 max-sm:py-1"
      >
        <span className="flex justify-start">
          <TeamSide
            name={shortName(teamNames[0])}
            team={0}
            score={scores[0]}
            target={target}
            count={trickCounts?.[0] ?? 0}
            points={roundPoints?.[0] ?? 0}
            special={specials?.[0]}
            colorVar={TEAM_VARS[0]}
            isMine={myTeam === 0}
            youLabel={t.you}
            testId="team-score-0"
          />
        </span>

        {/* Center: the live state — action, bet, trump. No filler. */}
        <span className="flex min-w-0 flex-col items-center gap-1 px-1 leading-none">
          {action !== undefined && (
            <span className="font-arcade-display text-[0.62em] tracking-[0.14em] whitespace-nowrap text-(--color-ap-violet-soft) uppercase max-sm:hidden">
              {action}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-2">
            {contract !== null ? (
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-(--color-ap-text) tabular-nums">
                <span className="truncate font-arcade-display uppercase">
                  {contract.playerName} {contract.value}
                  {contract.sansAtout ? ' SA' : ''}
                </span>
                {contract.progress !== undefined && (
                  <span className="font-arcade-display text-(--color-ap-muted)">
                    {contract.progress}/{contract.value}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[0.85em] whitespace-nowrap text-(--color-ap-muted)">
                {t.noBetYet}
              </span>
            )}
            <TrumpBadge trump={trump} trumpDecided={trumpDecided} />
          </span>
        </span>

        <span className="flex items-center justify-end gap-2.5 max-sm:gap-1.5">
          <TeamSide
            name={shortName(teamNames[1])}
            team={1}
            score={scores[1]}
            target={target}
            count={trickCounts?.[1] ?? 0}
            points={roundPoints?.[1] ?? 0}
            special={specials?.[1]}
            colorVar={TEAM_VARS[1]}
            mirrored
            isMine={myTeam === 1}
            youLabel={t.you}
            testId="team-score-1"
          />
          <span
            aria-hidden
            className={`grid size-[1.7em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) text-[0.7em] text-(--color-ap-muted) transition-transform ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <>
          {/* Dismiss layer: a tap anywhere off the panel collapses it. Sits
              below the panel + header (z-40) so both stay interactive. */}
          <button
            type="button"
            aria-label={t.dismissScore}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          {/* The full details float as a dropdown over the table instead of
              displacing it — the collapsed strip keeps its place in flow. */}
          <div className="absolute top-[calc(100%+0.5rem)] left-1/2 z-40 flex w-[min(28rem,94vw)] -translate-x-1/2 flex-col items-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 pt-4 pb-4 text-(length:--text-fluid-xs) shadow-(--shadow-ap-lg)">
            <ScorePad
              teamNames={teamNames}
              scores={scores}
              target={target}
              rounds={rounds}
              currentRound={currentRound}
              roundPoints={roundPoints}
              contract={contract}
              trump={trumpDecided ? trump : null}
              myTeam={myTeam}
            />
            {contract !== null && (
              <p className="text-(--color-ap-muted)">
                <span className="font-semibold text-(--color-ap-text)">{contract.playerName}</span>{' '}
                {t.mustTake}{' '}
                <span className="font-semibold text-(--color-ap-text)">{contract.value}</span>{' '}
                {t.trickPoints}
                {contract.sansAtout ? t.noTrumpStake : ''}
              </p>
            )}
            {actions !== undefined && (
              <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
