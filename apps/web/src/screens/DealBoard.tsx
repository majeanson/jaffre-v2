import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, useLang, type Lang } from '@jaffre/ui';
import {
  challengeIsOpen,
  dailyChallenge,
  weeklyChallenge,
  type Action,
  type ChallengeDeal,
} from '@jaffre/engine';
import {
  challengeLog,
  startChallenge,
  stopLocalGame,
  sendLocalAction,
} from '../local/localGame.js';
import { fetchBoard, submitRun, type ChallengeBoard } from '../net/challenge.js';
import { reportFunnel } from '../net/telemetry.js';
import { markDailyPlayed } from '../dailyPlayed.js';
import { useGameStore } from '../state/gameStore.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { NamePrompt, namePromptDue } from '../components/NamePrompt.js';
import { ShellNote } from '../components/ShellNote.js';
import { Table } from './Table.js';

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    loading: string;
    dailyName: string;
    weeklyName: string;
    blurb: string;
    play: string;
    replayed: string;
    board: string;
    empty: string;
    you: (rank: number) => string;
    scored: (score: number) => string;
    submitting: string;
    rejected: string;
    offline: string;
    alreadyPlayed: string;
    weeklyDeal: (n: number) => string;
    tricksTaken: (n: number) => string;
    backToBoard: string;
    streak: (n: number) => string;
    /** Shown in place of the flame line once the live streak has broken but
     * a past one is still worth naming — quieter than the flame (no emoji),
     * so it reads as a fact rather than a fresh thing to celebrate. */
    bestRun: (n: number) => string;
    share: string;
    shared: string;
    yesterday: string;
    rankOf: (rank: number, of: number) => string;
    /** Result card only: how close to the top the run landed, derived
     * client-side from rank/entries already on the payload. */
    topPercent: (n: number) => string;
    pointsOffLead: (n: number) => string;
    /** Short badge next to your own name in a board row — distinct from
     * `you`, which is a full sentence used elsewhere on this screen. */
    youBadge: string;
    headToHead: (name: string) => string;
    /** Shown instead of Play once a deal has rolled past its own period —
     * viewing yesterday's board must not offer a button that can't submit. */
    closed: string;
    /** Offline/network submit failures only — the run is still alive, so this
     * offers a second try at the SAME log rather than losing it. */
    retry: string;
  }
> = {
  en: {
    title: 'Deal Board',
    home: 'Home',
    loading: 'Loading…',
    dailyName: 'Hand of the Day',
    weeklyName: 'This week’s set',
    blurb:
      'The same deal for everyone, against the same bots. One try. Three minutes. Come back tomorrow for a new one.',
    play: 'Play the hand',
    replayed: 'You’ve already played this one.',
    board: 'Today’s board',
    empty: 'Nobody has posted a score yet. Be first.',
    you: (rank) => `You’re #${String(rank)}`,
    scored: (score) => `You scored ${String(score)}.`,
    submitting: 'Posting your score…',
    rejected: 'That run could not be verified, so it wasn’t posted.',
    offline: 'Your score needs the online server — it wasn’t posted.',
    alreadyPlayed: 'Only your first run counts, so this one wasn’t posted.',
    weeklyDeal: (n) => `Deal ${String(n)}`,
    tricksTaken: (n) => (n === 1 ? '1 trick taken' : `${String(n)} tricks taken`),
    backToBoard: 'Back to the board',
    streak: (n) => (n === 1 ? 'Day 1 of a streak' : `${String(n)} days in a row`),
    bestRun: (n) => `Best run: ${String(n)} day${n === 1 ? '' : 's'}.`,
    share: 'Share',
    shared: 'Copied!',
    yesterday: 'See yesterday’s board →',
    rankOf: (rank, of) => `#${String(rank)} of ${String(of)}`,
    topPercent: (n) => `Top ${String(n)}%`,
    pointsOffLead: (n) => (n === 1 ? '1 point off the lead' : `${String(n)} points off the lead`),
    youBadge: 'You',
    headToHead: (name) => `Head to head with ${name}`,
    closed: 'This deal is closed — today’s is waiting.',
    retry: 'Retry',
  },
  fr: {
    title: 'Tableau des donnes',
    home: 'Accueil',
    loading: 'Chargement…',
    dailyName: 'La main du jour',
    weeklyName: 'La série de la semaine',
    blurb:
      'La même donne pour tout le monde, contre les mêmes bots. Un essai. Trois minutes. Reviens demain pour une nouvelle.',
    play: 'Joue la main',
    replayed: 'Tu as déjà joué celle-là.',
    board: 'Le tableau du jour',
    empty: 'Personne n’a encore inscrit de pointage. Sois le premier.',
    you: (rank) => `Tu es #${String(rank)}`,
    scored: (score) => `Tu as fait ${String(score)}.`,
    submitting: 'On inscrit ton pointage…',
    rejected: 'Cette partie n’a pas pu être vérifiée, donc elle n’a pas été inscrite.',
    offline: 'Ton pointage a besoin du serveur en ligne — il n’a pas été inscrit.',
    alreadyPlayed: 'Seul ton premier essai compte, donc celui-ci n’a pas été inscrit.',
    weeklyDeal: (n) => `Donne ${String(n)}`,
    tricksTaken: (n) => (n === 1 ? '1 levée prise' : `${String(n)} levées prises`),
    backToBoard: 'Retour au tableau',
    streak: (n) => (n === 1 ? 'Jour 1 d’une séquence' : `${String(n)} jours de suite`),
    bestRun: (n) => `Meilleure série : ${String(n)} jour${n === 1 ? '' : 's'}.`,
    share: 'Partager',
    shared: 'Copié!',
    yesterday: 'Voir le tableau d’hier →',
    rankOf: (rank, of) => `#${String(rank)} sur ${String(of)}`,
    topPercent: (n) => `Dans le top ${String(n)} %`,
    pointsOffLead: (n) => (n === 1 ? 'à 1 point de la tête' : `à ${String(n)} points de la tête`),
    youBadge: 'Toi',
    headToHead: (name) => `Face à face avec ${name}`,
    closed: 'Cette donne est fermée — celle d’aujourd’hui t’attend.',
    retry: 'Réessayer',
  },
};

export interface DealBoardProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged board so the screen renders without the network. */
  readonly demoBoard?: ChallengeBoard;
  /** Scene viewer: pin "now" so the derived deal is stable across shots. */
  readonly demoNow?: number;
  /** Scene viewer: mount with the name card already open. It can't be reached
   * by clicking under automation — `namePromptDue()` is false when
   * `navigator.webdriver` is set unless `?nameprompt=1` rides along. */
  readonly demoNameGate?: boolean;
  /** Scene viewer: mount on the post-run result card. Only a real finished
   * round reaches it otherwise, which is 40s of bot alarms per shot. */
  readonly demoResult?: boolean;
}

type Phase = 'browsing' | 'playing' | 'submitting' | 'result' | 'done';

/**
 * The Deal Board — Hand of the Day and the weekly set, one machine.
 *
 * They are the same thing at two cadences (see @jaffre/engine's challenge.ts),
 * so they share a screen rather than splitting into two that would each be
 * half-empty. The daily is the reason to come back tomorrow; the weekly is the
 * reason to come back if you missed a day.
 */
export function DealBoard({
  onLeave,
  demoBoard,
  demoNow,
  demoNameGate,
  demoResult,
}: DealBoardProps) {
  const lang = useLang();
  const t = T[lang];
  const now = demoNow ?? Date.now();
  const staged = demoResult === true;
  const [deal, setDeal] = useState<ChallengeDeal>(() => dailyChallenge(now));
  const [board, setBoard] = useState<ChallengeBoard | null>(demoBoard ?? null);
  const [loading, setLoading] = useState(demoBoard === undefined);
  const [phase, setPhase] = useState<Phase>(staged ? 'result' : 'browsing');
  const [outcome, setOutcome] = useState<string | null>(staged ? T[lang].scored(14) : null);
  // Shown once, between tapping play and the deal — see the card's own note.
  const [gate, setGate] = useState(demoNameGate ?? false);
  // What the verifier gave back, held for the result screen. Null when the run
  // never scored (offline / rejected) — that case shows the reason instead.
  const [run, setRun] = useState<{ readonly score: number; readonly tricks: number } | null>(
    staged ? { score: 14, tricks: 6 } : null,
  );
  const [copied, setCopied] = useState(false);
  const gamePhase = useGameStore((s) => s.view?.phase);
  // Held only after a RETRYABLE submit failure (offline/network) — the local
  // game is deliberately left running (see trySubmit below), so this is the
  // same action log Retry re-sends. Null the rest of the time.
  const [retryActions, setRetryActions] = useState<readonly Action[] | null>(null);

  /**
   * The share line. The URL only ever points at the Deal Board DOOR (#daily),
   * never at this specific deal — it used to be documented as "carries the
   * challenge URL", which was never true: a recipient who opens it tomorrow
   * lands on TOMORROW's board, not the one this run was posted to. The period
   * key rides in the TEXT instead, so which deal this was survives even
   * though the link can't carry it. Native share sheet where there is one,
   * else the clipboard, matching shareHand() in replay/position.ts.
   */
  const shareResult = (): void => {
    if (run === null) return;
    const rank = board?.you?.rank;
    const of = board?.entries ?? board?.board.length ?? 0;
    const where = rank !== undefined && of > 0 ? ` · ${t.rankOf(rank, of)}` : '';
    const label = deal.cadence === 'daily' ? t.dailyName : t.weeklyName;
    const text = `Jaffré · ${label} · ${deal.periodKey} · ${String(run.score)} pts${where}`;
    const url = `${location.origin}/#daily`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      void nav.share({ text, url }).catch(() => {
        // Dismissed or unavailable despite the check — fall back rather than
        // leaving the tap with no effect at all.
        void navigator.clipboard.writeText(`${text}\n${url}`).then(
          () => setCopied(true),
          () => undefined,
        );
      });
      return;
    }
    void navigator.clipboard.writeText(`${text}\n${url}`).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  useEffect(() => {
    if (demoBoard !== undefined) return;
    let live = true;
    setLoading(true);
    fetchBoard(deal.id)
      .then((b) => {
        if (!live) return;
        setBoard(b);
        setLoading(false);
        // Self-heal a second device: the board is server truth, so if it
        // already carries a row for YOU on TODAY's daily, this browser must
        // have missed the markDailyPlayed write that normally happens right
        // after posting (played elsewhere, or a storage hiccup here) — catch
        // it up so DailyDoor's chip stops inviting a hand already played.
        if (b?.you != null && deal.id === dailyChallenge(now).id) {
          markDailyPlayed(deal.id);
        }
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [deal.id, demoBoard]);

  // Tear the challenge down on the way out — a half-played daily left running
  // would otherwise still be there behind the next screen.
  useEffect(() => () => stopLocalGame(), []);

  // Two funnel steps, because the interesting question is the gap between
  // them: plenty of people will find the Deal Board, and the number who
  // actually finish a hand and land on it is the one worth watching. Latched
  // once per browser, so this is first-run reach, not daily usage. Never fires
  // for the scene viewer, which isn't a player finding anything.
  useEffect(() => {
    if (demoBoard === undefined) reportFunnel('daily');
  }, [demoBoard]);

  /**
   * Post the run. Shared by the round-end effect below and the Retry button —
   * both submit the identical action log. On a definitive answer (posted, or
   * rejected by the server for cause) the local game tears down as before. On
   * a retryable failure (offline/network — nothing about the run itself was
   * wrong) it stays alive: the felt already tore itself down when the last
   * trick landed, but the actions and the challenge server's judgement of
   * them are two different things, and only the second one failed.
   */
  const trySubmit = (actions: readonly Action[]): void => {
    setPhase('submitting');
    void submitRun(deal.id, actions).then((result) => {
      if (!result.ok && result.reason === 'offline') {
        setRetryActions(actions);
        setOutcome(t.offline);
        setRun(null);
        setPhase('result');
        return;
      }
      stopLocalGame();
      setRetryActions(null);
      if (!result.ok) {
        setOutcome(t.rejected);
        setRun(null);
      } else {
        setOutcome(
          result.accepted ? t.scored(result.score) : `${t.alreadyPlayed} ${t.scored(result.score)}`,
        );
        setRun({ score: result.score, tricks: result.tricks });
        if (result.accepted) reportFunnel('daily-score');
        // Only the daily: the home door's chip advertises today's hand, and
        // the weeklies have their own tabs rather than a front-door slot.
        if (deal.cadence === 'daily') markDailyPlayed(deal.id);
      }
      // The run STOPS here, it does not vanish. The felt tore itself down the
      // instant the last trick landed and dropped the player back on the board
      // next to a greyed-out "already played" button — the one moment they
      // actually wanted to look at was the one they never got.
      setPhase('result');
      // Re-read the board so the player sees where their score landed.
      void fetchBoard(deal.id).then((b) => b !== null && setBoard(b));
    });
  };

  // The run ends when the ROUND ends: a challenge is one deal, not a game.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (gamePhase !== 'round_over' && gamePhase !== 'game_over') return;
    const actions = challengeLog();
    if (actions === null) return;
    trySubmit(actions);
  }, [phase, gamePhase, deal.id, t]);

  if (phase === 'playing') return <Table onAction={sendLocalAction} onLeave={onLeave} />;

  const alreadyPlayed = board?.you != null;
  const open = challengeIsOpen(deal, now);
  const weekly = weeklyChallenge(now);
  const start = (): void => {
    startChallenge(deal);
    setOutcome(null);
    setRun(null);
    setGate(false);
    setPhase('playing');
  };

  // How close the run landed to the top, purely from what the board payload
  // already carries (rank/entries, and the leading score sitting at
  // board.board[0] since rows are already ordered by score desc) — nothing
  // new to fetch, nothing the server needs to precompute.
  const topPercentLine: string[] = [];
  if (board?.you != null && board.entries !== undefined && board.entries > 0) {
    topPercentLine.push(
      t.topPercent(Math.max(1, Math.ceil((board.you.rank / board.entries) * 100))),
    );
    const leadScore = board.board[0]?.score;
    if (leadScore !== undefined) {
      const off = leadScore - board.you.score;
      if (off > 0) topPercentLine.push(t.pointsOffLead(off));
    }
  }
  // The streak is a DAILY habit — a weekly result card showing it would
  // misattribute a run at a completely different cadence. Gate on the id
  // prefix rather than deal.cadence: the id is what the server keys the same
  // streak read on, so the two can never disagree.
  const dailyStreakInfo = deal.id.startsWith('d-') ? (board?.streak ?? null) : null;

  // The hand is over and the score is in: hold here until the player is done
  // reading it. Everything below (tabs, board, play button) is deliberately
  // absent — this screen has exactly one thing to say and one way onward.
  if (phase === 'result') {
    return (
      <main className="grid min-h-full place-items-center bg-(--color-ap-ground) p-6 text-(--color-ap-text)">
        <section
          data-testid="deal-result"
          className="flex w-full max-w-sm flex-col items-center gap-[0.8em] rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-paper) p-[1.4em] text-center shadow-(--shadow-ap-lg)"
        >
          {/* Ivory card face in both skins, so its text is ink — never the
              flipping --color-ap-text (the same rule the recap hero follows). */}
          {/* This card IS the page while it's up, so it carries the h1 the
              board's own header would otherwise own. */}
          <h1 className="font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-ink)/70">
            {deal.cadence === 'daily' ? t.dailyName : t.weeklyName}
          </h1>
          {run === null ? (
            <>
              <p
                data-testid="deal-outcome"
                className="font-arcade-ui text-[0.9em] text-(--color-ap-ink)"
              >
                {outcome}
              </p>
              {/* Only reachable after a RETRYABLE failure (offline/network) —
                  the local game and its action log are still alive, so this
                  re-sends the identical run rather than making the player
                  replay a hand that was never the problem. */}
              {retryActions !== null && (
                <button
                  type="button"
                  onClick={() => trySubmit(retryActions)}
                  className="mt-[0.2em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-[1em] py-[0.5em] font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap)"
                >
                  {t.retry}
                </button>
              )}
            </>
          ) : (
            <>
              <span className="font-arcade-display text-[3em] leading-none tabular-nums text-(--color-ap-gold-deep)">
                {run.score}
              </span>
              <span className="font-arcade-ui text-[0.85em] text-(--color-ap-ink)/75">
                {t.tricksTaken(run.tricks)}
              </span>
              <p
                data-testid="deal-outcome"
                className="font-arcade-ui text-[0.85em] text-(--color-ap-ink)"
              >
                {outcome}
              </p>
              {board?.you != null && (
                <span className="font-arcade-display text-[1.1em] uppercase text-(--color-ap-ink)">
                  {board.entries !== undefined && board.entries > 0
                    ? t.rankOf(board.you.rank, board.entries)
                    : t.you(board.you.rank)}
                </span>
              )}
              {/* Percentile + gap to the lead, both derived client-side from
                  fields the payload already carries — nothing new fetched. */}
              {topPercentLine.length > 0 && (
                <span className="font-arcade-ui text-[0.8em] text-(--color-ap-ink)/80">
                  {topPercentLine.join(' · ')}
                </span>
              )}
              {/* The reason to come back tomorrow, stated. Derived from the
                  rows already in challenge_scores — nothing stored, nothing
                  to repair, retroactive for everyone who ever played. */}
              {/* INK, not --color-ap-gold-deep. That token is documented as
                  ≥3:1 on paper, which is the LARGE-text bar — fine for the
                  3em score above, but this line is 0.85em and needs 4.5:1.
                  Axe flagged exactly this element and not the score. The
                  flame carries the warmth instead of the text colour. */}
              {dailyStreakInfo !== null && dailyStreakInfo.current > 0 && (
                <span className="font-arcade-ui text-[0.85em] text-(--color-ap-ink)">
                  🔥 {t.streak(dailyStreakInfo.current)}
                </span>
              )}
              {/* The streak broke, but a past one still says something — quiet
                  on purpose (no flame), so it reads as a fact, not a fresh win. */}
              {dailyStreakInfo !== null &&
                dailyStreakInfo.current === 0 &&
                dailyStreakInfo.best > 0 && (
                  <span className="font-arcade-ui text-[0.85em] text-(--color-ap-ink)/75">
                    {t.bestRun(dailyStreakInfo.best)}
                  </span>
                )}
              <button
                type="button"
                onClick={shareResult}
                className="font-arcade-ui text-[0.8em] text-(--color-ap-ink)/70 underline decoration-dotted underline-offset-2 hover:text-(--color-ap-ink)"
              >
                {copied ? t.shared : t.share}
              </button>
            </>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => setPhase('done')}
            className="mt-[0.4em] w-full rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-[1em] py-[0.5em] font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap)"
          >
            {t.backToBoard}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />
        <MetaNav current="dealboard" />

        {/* Which deal you're looking at: today's, or one of the week's three. */}
        <nav className="flex flex-wrap gap-2" aria-label={t.title}>
          {[dailyChallenge(now), ...weekly].map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeal(d)}
              aria-current={d.id === deal.id}
              className={`rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.7em] py-[0.25em] font-arcade-ui text-[0.78em] uppercase tracking-wide shadow-(--shadow-ap-sm) ${
                d.id === deal.id
                  ? // Ink, not white: white on violet is 3.9:1, and the whole
                    // app pairs violet with ink at 5.1:1. Third instance of
                    // this exact slip on this screen alone.
                    'bg-(--color-ap-violet) text-(--color-ap-ink)'
                  : 'bg-(--color-ap-panel) text-(--color-ap-muted)'
              }`}
            >
              {i === 0 ? t.dailyName : t.weeklyDeal(i)}
            </button>
          ))}
        </nav>

        <ShellNote>
          <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/85">{t.blurb}</p>
        </ShellNote>

        {outcome !== null && (
          <p
            data-testid="deal-outcome"
            className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.8em] font-arcade-ui text-[0.85em] shadow-(--shadow-ap-sm)"
          >
            {outcome}
          </p>
        )}

        {/* The last moment before a score exists. This board is public and is
            reachable from home without ever entering a room, so it is the one
            place a never-renamed guest is about to compete under the default
            name. One tap either way: answering or skipping starts the hand. */}
        {gate && <NamePrompt onDone={start} forceOpen={demoNameGate ?? false} />}

        {phase === 'submitting' ? (
          <PixelWave label={t.submitting} />
        ) : !open ? (
          // A closed challenge (yesterday's board, most often) can't take a
          // submission — the server's own open rule (challengeById + the
          // period-key compare) would reject it, so the button never belonged
          // here in the first place. Same line style as the outcome banner.
          <p
            data-testid="deal-closed"
            className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.8em] font-arcade-ui text-[0.85em] text-(--color-ap-muted) shadow-(--shadow-ap-sm)"
          >
            {t.closed}
          </p>
        ) : (
          <button
            type="button"
            disabled={alreadyPlayed}
            onClick={() => {
              // Gate on intent, not on arrival — the board is also a thing you
              // just read. Never on the submit itself: that fires automatically
              // at round_over, and a card there could cost a finished run.
              if (namePromptDue()) {
                setGate(true);
                return;
              }
              start();
            }}
            // Ink on violet — the same fix, and the same reason, as the
            // "Play it out" button on the shared-hand screen: these two were
            // the only primary CTAs that never named a text colour.
            className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-[1em] py-[0.5em] font-arcade-display text-[1em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap) disabled:bg-(--color-ap-panel) disabled:text-(--color-ap-muted)"
          >
            {alreadyPlayed ? t.replayed : t.play}
          </button>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-muted)">
            {t.board}
          </h2>
          {/* Same streak the result card names, surfaced here too — the
              browse screen is where a returning player actually SEES it,
              since a result card only shows up right after playing. Dailies
              only (see dailyStreakInfo above). */}
          {dailyStreakInfo !== null && dailyStreakInfo.current > 0 && (
            <p
              data-testid="daily-streak"
              className="font-arcade-ui text-[0.8em] text-(--color-ap-text)"
            >
              🔥 {t.streak(dailyStreakInfo.current)}
            </p>
          )}
          {dailyStreakInfo !== null &&
            dailyStreakInfo.current === 0 &&
            dailyStreakInfo.best > 0 && (
              <p
                data-testid="daily-streak"
                className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)"
              >
                {t.bestRun(dailyStreakInfo.best)}
              </p>
            )}
          {loading ? (
            <PixelWave label={t.loading} />
          ) : board === null || board.board.length === 0 ? (
            <ShellNote>{t.empty}</ShellNote>
          ) : (
            <ol className="flex flex-col gap-1">
              {board.board.map((row) => (
                <BoardRowLink
                  key={row.id}
                  row={row}
                  mine={row.rank === board.you?.rank}
                  youBadge={t.youBadge}
                  headToHeadLabel={t.headToHead}
                />
              ))}
              {/* Pinned below the list, same "···" treatment the leaderboard
                  uses for an off-page caller — only when your row isn't
                  already one of the ones just rendered above. */}
              {board.you != null && !board.board.some((r) => r.rank === board.you?.rank) && (
                <>
                  <li className="py-1 text-center font-arcade-display text-(--color-ap-muted)">
                    ···
                  </li>
                  <BoardRowLink
                    row={{
                      // Inert either way: BoardRowLink never builds a link for
                      // "mine", so an empty id here never reaches an href.
                      id: board.you.id ?? '',
                      name: board.you.name ?? t.you(board.you.rank),
                      color: board.you.color ?? null,
                      paint: board.you.paint ?? null,
                      score: board.you.score,
                      rank: board.you.rank,
                    }}
                    mine
                    youBadge={t.youBadge}
                    headToHeadLabel={t.headToHead}
                  />
                </>
              )}
            </ol>
          )}
          {board?.you != null && (
            <p className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
              {t.you(board.you.rank)} · {t.scored(board.you.score)}
            </p>
          )}
          {/* Yesterday is a LINK, not a fifth tab: challengeIsOpen is false for
              a closed deal, so it can only be read, and the tab row is for
              deals you can still play. Missing a day stops meaning the result
              is gone. */}
          {deal.cadence === 'daily' && (
            <button
              type="button"
              onClick={() => {
                const prev = dailyChallenge(now - 86_400_000);
                if (prev.id !== deal.id) setDeal(prev);
              }}
              className="self-start font-arcade-ui text-[0.8em] text-(--color-ap-muted) underline decoration-dotted underline-offset-2 hover:text-(--color-ap-text)"
            >
              {t.yesterday}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * One board row: AvatarChip + name + score, linking into `#h2h/<row.id>` —
 * the same "every named player is a door" rule the leaderboard's Row
 * follows (routes/leaderboard.ts and routes/dealBoard.ts both hash the uid
 * on the way out) — except your own row, which stays inert. A record
 * against yourself isn't a thing, and it's also the row the off-page pin
 * below the list reuses for "you".
 */
function BoardRowLink({
  row,
  mine,
  youBadge,
  headToHeadLabel,
}: {
  readonly row: {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
    readonly paint?: string | null | undefined;
    readonly rank: number;
    readonly score: number;
  };
  readonly mine: boolean;
  readonly youBadge: string;
  readonly headToHeadLabel: (name: string) => string;
}) {
  const inner = (
    <>
      <span className="w-[2em] shrink-0 tabular-nums text-(--color-ap-muted)">{row.rank}</span>
      <AvatarChip
        name={row.name}
        color={row.color ?? undefined}
        paint={row.paint ?? null}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate">
        {row.name}
        {mine && (
          <span className="ml-[0.5em] font-arcade-display text-[0.7em] uppercase text-(--color-ap-violet-soft)">
            {youBadge}
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-(--color-ap-gold)">{row.score}</span>
    </>
  );
  const shell = `flex items-center gap-3 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.7em] py-[0.35em] font-arcade-ui text-[0.85em] ${
    mine ? 'bg-(--color-ap-violet)/15' : 'bg-(--color-ap-panel)'
  }`;
  if (mine) return <li className={shell}>{inner}</li>;
  return (
    <li>
      <a
        href={`#h2h/${row.id}`}
        className={`${shell} transition-colors hover:bg-(--color-ap-panel-hover)`}
      >
        {inner}
        {/* sr-only suffix, NOT an aria-label — a label would REPLACE the
            row's own text as the link's accessible name (same rule the
            leaderboard's Row follows). */}
        <span className="sr-only">{headToHeadLabel(row.name)}</span>
      </a>
    </li>
  );
}
