import { useEffect, useState } from 'react';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { RoomComms } from '../comms/RoomComms.js';
import { LinkNudge } from '../components/LinkAccount.js';
import { NoticeToast } from '../components/NoticeToast.js';
import { HelpButton } from '../help/HelpButton.js';
import { connect, send } from '../net/socket.js';
import { consumeMakePublic } from '../net/rooms.js';
import { NamePrompt } from '../components/NamePrompt.js';
import { SeatPicker } from '../room/SeatPicker.js';
import { ShareButton } from '../components/ShareButton.js';
import { ConnectionBanner } from '../table/ConnectionBanner.js';
import { useGameStore } from '../state/gameStore.js';

/** A secondary arcade button as a class string — for HelpButton, which takes a
 * className rather than a variant. Mirrors the Cta secondary look. */
const ARCADE_SECONDARY =
  'inline-flex cursor-pointer items-center justify-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[1.1em] py-[0.7em] font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-105 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

export interface LobbyProps {
  readonly code: string;
  readonly onLeave: () => void;
  /** Give the seat up for good and drop the table from "Your tables" —
   * distinct from `onLeave`, which just goes Home and keeps it. */
  readonly onLeaveTable?: (() => void) | undefined;
}

const T: Record<
  Lang,
  {
    room: (code: string) => string;
    share: string;
    hostWaiting: (name: string) => string;
    watching: (n: number) => string;
    connecting: string;
    start: string;
    waitingHelper: (n: number) => string;
    fillBots: string;
    back: string;
    howToPlay: string;
    hailMary: string;
    hailMaryHint: string;
    turnTimer: string;
    turnTimerHint: string;
    tableStyle: string;
    tableStyleHint: string;
    publicTable: string;
    publicHint: string;
    reclaimHint: string;
    houseRules: string;
    publicPill: string;
    privatePill: string;
    leaveTable: string;
    leaveConfirm: string;
  }
> = {
  en: {
    room: (code) => `Room ${code}`,
    share: 'Share this code with your table.',
    // The host-centric "share this code" line makes no sense addressed to a
    // guest who just followed a link — they can't invite anyone to a seat
    // they don't have yet. Once someone's sat down, tell the newcomer WHO
    // they're joining instead.
    hostWaiting: (name) => `${name} is waiting for you.`,
    watching: (n) => `${String(n)} watching`,
    connecting: 'Connecting…',
    start: 'Start the game',
    // Bots are the liquidity engine, not a consolation prize: a public table
    // that starts with them stays joinable, and arrivals take their seats.
    // The old line ("add bots or share the code") read as "give up on people".
    waitingHelper: (n) =>
      `${String(n)} seat${n === 1 ? '' : 's'} left — start with bots, people can drop in`,
    fillBots: 'Fill with bots',
    // "Home" — the one exit word across the app (MetaHeader, Visitor, here).
    back: '← Home',
    howToPlay: 'How to play',
    hailMary: 'Hail-Mary 12 sans atout',
    hailMaryHint: 'Make 12 sans atout to win the whole game — miss and you lose it.',
    turnTimer: 'Turn timer',
    turnTimerHint: '60 seconds per turn, then a bot plays it.',
    // Host-only (see the toggle's disabled state below) — the ONE rule here
    // that isn't about how the game is played, but how the table looks to
    // everyone at it.
    tableStyle: "Table style: host's",
    tableStyleHint:
      "Everyone at the table sees the host's felt, cards & trick sweep instead of their own.",
    publicTable: 'List on the public lobby',
    publicHint: 'Anyone can join from the public lobby. Untick for invite-only.',
    reclaimHint: 'One of these seats yours? Log in on the home screen to reclaim it.',
    houseRules: 'House rules',
    publicPill: 'Public',
    privatePill: 'Private',
    leaveTable: 'Leave table',
    leaveConfirm: 'Sure? Seat frees up',
  },
  fr: {
    room: (code) => `Salon ${code}`,
    share: 'Partage ce code avec ta table.',
    hostWaiting: (name) => `${name} t'attend.`,
    watching: (n) => `${String(n)} spectateur·rices`,
    connecting: 'Connexion…',
    start: 'Commencer la partie',
    waitingHelper: (n) =>
      `${String(n)} siège${n === 1 ? '' : 's'} à remplir — pars avec des bots, le monde peut embarquer`,
    fillBots: 'Remplis avec des bots',
    // "Accueil" (the meta screens' home label), not "Retour à l'accueil": the
    // long form wrapped the footer pair into a stack and pushed "Comment
    // jouer" below the 900px fold.
    back: '← Accueil',
    howToPlay: 'Comment jouer',
    hailMary: 'Hail-Mary 12 sans atout — tout ou rien',
    hailMaryHint: 'Réussis 12 sans atout et tu gagnes la partie — rate-la et tu la perds.',
    turnTimer: 'Minuterie de tour',
    turnTimerHint: '60 secondes par tour; après, un bot joue à ta place.',
    tableStyle: "Style de table : celui de l'hôte",
    tableStyleHint:
      "Tout le monde à la table voit le tapis, les cartes et le ramassage des levées de l'hôte, au lieu des siens.",
    publicTable: 'Afficher dans le salon public',
    publicHint:
      'Tout le monde peut joindre via le salon public. Décoche pour jouer sur invitation.',
    reclaimHint:
      "Un de ces sièges est à toi? Connecte-toi sur l'écran d'accueil pour le reprendre.",
    houseRules: 'Règles maison',
    publicPill: 'Publique',
    privatePill: 'Privée',
    leaveTable: 'Quitter la table',
    leaveConfirm: 'Certain? Le siège se libère',
  },
};

/** Pre-game room: pick a seat, fill the rest with bots, start. */
export function Lobby({ code, onLeave, onLeaveTable }: LobbyProps) {
  const t = T[useLang()];
  // Two-tap confirm on the irreversible exit, same contract as the table's.
  const [leaveArmed, setLeaveArmed] = useState(false);
  useEffect(() => {
    if (!leaveArmed) return undefined;
    const timer = setTimeout(() => setLeaveArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [leaveArmed]);
  const { roster, viewer, connection } = useGameStore();
  const full = roster !== null && roster.seats.every((s) => s !== null);
  const emptySeats = roster === null ? 4 : roster.seats.filter((s) => s === null).length;
  const seated = typeof viewer === 'number';
  // Whoever's sat in hostSeat, if anyone has — drives the unseated arrival's
  // header line below (H4: a guest sees who they're joining, not host-facing
  // "share this code" copy that doesn't apply to them).
  const hostSeatInfo =
    roster !== null && roster.hostSeat !== undefined
      ? (roster.seats[roster.hostSeat] ?? null)
      : null;
  const showHostWaiting = !seated && hostSeatInfo !== null;
  // Sends add_bot for every still-empty seat — the one-tap version of what
  // waitingHelper below already promises ("start with bots").
  const fillWithBots = () => {
    if (roster === null) return;
    roster.seats.forEach((s, i) => {
      if (s === null) send({ t: 'add_bot', seat: i as 0 | 1 | 2 | 3, difficulty: 'normal' });
    });
  };
  // House rule ships ON — new rooms start with Hail-Mary enabled (server
  // default matches; unchecking is the deliberate act).
  const hailMary = roster?.rules?.hailMary12 ?? true;
  // Turn timer ships ON (server default matches — turnTimerRuleOn); unchecking
  // it is the deliberate opt-down to an untimed home game.
  const turnTimer = roster?.rules?.turnTimer ?? true;
  // Table style ships OFF ('own') — opting IN to the host's look is the
  // deliberate act, same asymmetry as hail-mary/turn-timer's opt-OUT (default
  // is whichever direction nobody has to think about).
  const tableStyleOn = (roster?.rules?.tableStyle ?? 'own') === 'host';
  // Only the host may flip it — everyone else still SEES the toggle (so a
  // non-default rule is never invisible to them), just can't touch it.
  const isHost = seated && roster?.hostSeat !== undefined && roster.hostSeat === viewer;
  const isPublic = roster?.public ?? false;

  // Rules fold behind one door, closed by default. Auto-open ONCE when the
  // roster shows a non-default rule (hail-mary OFF, timer OFF, or table style
  // ON) so a changed rule is never invisible. Public is excluded: created
  // rooms are public by default, so public=true is the normal state, not a
  // surprise.
  const [rulesOpen, setRulesOpen] = useState(false);
  const hasRoster = roster !== null;
  useEffect(() => {
    if (hasRoster && (!hailMary || !turnTimer || tableStyleOn)) setRulesOpen(true);
  }, [hasRoster, hailMary, turnTimer, tableStyleOn]);

  // Any room this browser created (Quick Play or Create a room) is public by
  // default: once we're seated, flip it on. Unticking the toggle below is the
  // deliberate opt-down to invite-only.
  useEffect(() => {
    if (seated && consumeMakePublic(code)) send({ t: 'set_public', on: true });
  }, [seated, code]);

  return (
    <main className="table-felt grid min-h-full place-items-center p-6">
      <NoticeToast />
      <div className="flex w-full max-w-md flex-col gap-4">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="font-arcade-display text-3xl uppercase text-(--color-ap-gold)">
              {t.room(code)}
            </h1>
            {/* Labeled: this whole screen's job is inviting people in — the
                icon-only form (right for a hover-bar cell elsewhere) would
                bury the one action a fresh room most needs. */}
            <ShareButton code={code} labeled />
            <span
              data-testid="visibility-pill"
              className="rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2.5 py-0.5 font-arcade-ui text-[0.65em] uppercase tracking-wide text-(--color-ap-muted)"
            >
              {isPublic ? t.publicPill : t.privatePill}
            </span>
          </div>
          <p className="mt-1 text-sm text-(--color-ap-muted)">
            {/* J1: "Share this code" only makes sense while the socket is
                actually open — a reconnecting/closed player has no live room
                to invite anyone into, and the ConnectionBanner just below
                already says the connection is the problem. Falls back to the
                same connecting copy for that stretch rather than adding a
                third line that would just repeat the banner. */}
            {connection === 'connecting' || connection === 'reconnecting' || connection === 'closed'
              ? t.connecting
              : showHostWaiting && hostSeatInfo !== null
                ? t.hostWaiting(hostSeatInfo.name)
                : t.share}
          </p>
          {roster !== null && roster.spectators > 0 && (
            <p className="mt-1 text-xs text-(--color-ap-muted)">{t.watching(roster.spectators)}</p>
          )}
        </header>

        {/* In-flow (its own row): the table's fixed variant lands on the seat
            rows at phone heights. */}
        <ConnectionBanner inline />

        {/* One-shot: players still named "Player" get a single field before
            they sit, so the default name never becomes their online identity.
            Reconnect only on a real rename — there is no rename message, names
            travel at connect, and the welcome snapshot restores seat + state. */}
        <NamePrompt
          onDone={(renamed) => {
            if (renamed) connect(code);
          }}
        />

        <SeatPicker
          roster={roster}
          viewer={viewer}
          onSit={(seat) => send({ t: 'sit', seat })}
          onAddBot={(seat, difficulty) => send({ t: 'add_bot', seat, difficulty })}
          onRemoveBot={(seat) => send({ t: 'remove_bot', seat })}
          onKick={(seat) => send({ t: 'kick', seat })}
          {...(roster?.hostSeat !== undefined ? { hostSeat: roster.hostSeat } : {})}
        />

        {/* Quiet reclaim hint: spectating a full, not-yet-started table — a
            browser that lost its token can log in on Home to get its seat back. */}
        {roster !== null && !roster.started && !seated && full && (
          <p className="text-center font-arcade-ui text-xs text-(--color-ap-muted)">
            {t.reclaimHint}
          </p>
        )}

        <details
          open={rulesOpen}
          onToggle={(e) => setRulesOpen(e.currentTarget.open)}
          className="group rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap)"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-control) px-4 py-3 hover:bg-(--color-ap-panel-hover)">
            <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
              {t.houseRules}
            </span>
            <span
              aria-hidden
              className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open:rotate-90"
            >
              ▸
            </span>
          </summary>
          <div className="flex flex-col gap-3 border-t-2 border-(--color-ap-ink) px-3 pb-3 pt-3">
            <label
              className={`flex items-start gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap) ${
                seated ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                role="switch"
                checked={hailMary}
                disabled={!seated}
                // Every switch sends the WHOLE rule set, never just its own
                // field: onSetRules replaces meta.rules outright, so a partial
                // send silently reverts the rules it left out (this one used to
                // wipe tableStyle back to 'own').
                onChange={(e) =>
                  send({
                    t: 'set_rules',
                    hailMary12: e.target.checked,
                    turnTimer,
                    tableStyle: tableStyleOn ? 'host' : 'own',
                  })
                }
                className="mt-0.5 size-5 shrink-0 accent-(--color-ap-gold)"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
                  {t.hailMary}
                </span>
                <span className="text-xs leading-snug text-(--color-ap-muted)">
                  {t.hailMaryHint}
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap) ${
                seated ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                role="switch"
                data-testid="turn-timer-toggle"
                checked={turnTimer}
                disabled={!seated}
                onChange={(e) =>
                  send({
                    t: 'set_rules',
                    hailMary12: hailMary,
                    turnTimer: e.target.checked,
                    tableStyle: tableStyleOn ? 'host' : 'own',
                  })
                }
                className="mt-0.5 size-5 shrink-0 accent-(--color-ap-gold)"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
                  {t.turnTimer}
                </span>
                <span className="text-xs leading-snug text-(--color-ap-muted)">
                  {t.turnTimerHint}
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap) ${
                isHost ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                role="switch"
                data-testid="table-style-toggle"
                checked={tableStyleOn}
                disabled={!isHost}
                onChange={(e) =>
                  send({
                    t: 'set_rules',
                    hailMary12: hailMary,
                    turnTimer,
                    tableStyle: e.target.checked ? 'host' : 'own',
                  })
                }
                className="mt-0.5 size-5 shrink-0 accent-(--color-ap-gold)"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
                  {t.tableStyle}
                </span>
                <span className="text-xs leading-snug text-(--color-ap-muted)">
                  {t.tableStyleHint}
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap) ${
                seated ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                role="switch"
                data-testid="public-toggle"
                checked={isPublic}
                disabled={!seated}
                onChange={(e) => send({ t: 'set_public', on: e.target.checked })}
                className="mt-0.5 size-5 shrink-0 accent-(--color-ap-gold)"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
                  {t.publicTable}
                </span>
                <span className="text-xs leading-snug text-(--color-ap-muted)">{t.publicHint}</span>
              </span>
            </label>
          </div>
        </details>

        <Cta onClick={() => send({ t: 'start' })} disabled={!full} className="w-full">
          {t.start}
        </Cta>
        {!full && (
          <>
            <p className="-mt-4 text-center font-arcade-ui text-xs text-(--color-ap-muted)">
              {t.waitingHelper(emptySeats)}
            </p>
            {/* The button behind the promise above — add_bot per empty seat,
                same message the per-seat "Add bot" already sends. */}
            <Cta
              variant="secondary"
              data-testid="fill-bots"
              onClick={fillWithBots}
              className="w-full"
            >
              {t.fillBots}
            </Cta>
          </>
        )}

        {/* One comms surface for the whole room life: chat (voice in its send
            row) and the shared music queue — same component the table uses. */}
        <RoomComms variant="panel" me={typeof viewer === 'number' ? viewer : null} />

        {/* Quiet pre-game moment: about to start — one muted line about
            keeping your games. Gone once anything is linked. */}
        <LinkNudge />

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Cta variant="secondary" onClick={onLeave}>
            {t.back}
          </Cta>
          {/* Distinct from Home: that keeps your seat and the table card;
              this hands the seat back and forgets the table. */}
          {onLeaveTable !== undefined && seated && (
            <Cta
              variant="secondary"
              data-testid="leave-table"
              className={
                leaveArmed ? 'border-(--color-ap-danger) text-(--color-ap-danger-text)' : ''
              }
              onClick={() => {
                if (leaveArmed) onLeaveTable();
                else setLeaveArmed(true);
              }}
            >
              {leaveArmed ? t.leaveConfirm : t.leaveTable}
            </Cta>
          )}
          <HelpButton label={t.howToPlay} className={ARCADE_SECONDARY} />
        </div>
      </div>
    </main>
  );
}
