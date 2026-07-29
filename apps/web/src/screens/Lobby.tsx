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
    connecting: string;
    start: string;
    waitingHelper: (n: number) => string;
    back: string;
    howToPlay: string;
    hailMary: string;
    hailMaryHint: string;
    turnTimer: string;
    turnTimerHint: string;
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
    connecting: 'Connecting…',
    start: 'Start the game',
    waitingHelper: (n) =>
      `${String(n)} seat${n === 1 ? '' : 's'} left — add bots or share the code`,
    // "Home" — the one exit word across the app (MetaHeader, Visitor, here).
    back: '← Home',
    howToPlay: 'How to play',
    hailMary: 'Hail-Mary 12 sans atout',
    hailMaryHint: 'Make 12 sans atout to win the whole game — miss and you lose it.',
    turnTimer: 'Turn timer',
    turnTimerHint: '60 seconds per turn, then a bot plays it.',
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
    connecting: 'Connexion…',
    start: 'Commencer la partie',
    waitingHelper: (n) =>
      `${String(n)} siège${n === 1 ? '' : 's'} à remplir — ajoute des bots ou partage le code`,
    // "Accueil" (the meta screens' home label), not "Retour à l'accueil": the
    // long form wrapped the footer pair into a stack and pushed "Comment
    // jouer" below the 900px fold.
    back: '← Accueil',
    howToPlay: 'Comment jouer',
    hailMary: 'Hail-Mary 12 sans atout — tout ou rien',
    hailMaryHint: 'Réussis 12 sans atout et tu gagnes la partie — rate-la et tu la perds.',
    turnTimer: 'Minuterie de tour',
    turnTimerHint: '60 secondes par tour; après, un bot joue à ta place.',
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
  // House rule ships ON — new rooms start with Hail-Mary enabled (server
  // default matches; unchecking is the deliberate act).
  const hailMary = roster?.rules?.hailMary12 ?? true;
  // Turn timer ships ON (server default matches — turnTimerRuleOn); unchecking
  // it is the deliberate opt-down to an untimed home game.
  const turnTimer = roster?.rules?.turnTimer ?? true;
  const isPublic = roster?.public ?? false;

  // Rules fold behind one door, closed by default. Auto-open ONCE when the
  // roster shows a non-default rule (hail-mary OFF or timer OFF) so a changed
  // rule is never invisible. Public is excluded: created rooms are public by
  // default, so public=true is the normal state, not a surprise.
  const [rulesOpen, setRulesOpen] = useState(false);
  const hasRoster = roster !== null;
  useEffect(() => {
    if (hasRoster && (!hailMary || !turnTimer)) setRulesOpen(true);
  }, [hasRoster, hailMary, turnTimer]);

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
            <ShareButton code={code} />
            <span
              data-testid="visibility-pill"
              className="rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2.5 py-0.5 font-arcade-ui text-[0.65em] uppercase tracking-wide text-(--color-ap-muted)"
            >
              {isPublic ? t.publicPill : t.privatePill}
            </span>
          </div>
          <p className="mt-1 text-sm text-(--color-ap-muted)">
            {connection === 'connecting' ? t.connecting : t.share}
          </p>
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
                onChange={(e) => send({ t: 'set_rules', hailMary12: e.target.checked, turnTimer })}
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
                  send({ t: 'set_rules', hailMary12: hailMary, turnTimer: e.target.checked })
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
          <p className="-mt-4 text-center font-arcade-ui text-xs text-(--color-ap-muted)">
            {t.waitingHelper(emptySeats)}
          </p>
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
