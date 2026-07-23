import { useEffect } from 'react';
import { ChatPanel, Cta, useLang, type Lang } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { LinkNudge } from '../components/LinkAccount.js';
import { NoticeToast } from '../components/NoticeToast.js';
import { HelpButton } from '../help/HelpButton.js';
import { send } from '../net/socket.js';
import { consumeMakePublic } from '../net/rooms.js';
import { SeatPicker } from '../room/SeatPicker.js';
import { ShareButton } from '../components/ShareButton.js';
import { useGameStore } from '../state/gameStore.js';
import { VoiceControls } from '../voice/VoiceControls.js';

/** A secondary arcade button as a class string — for HelpButton, which takes a
 * className rather than a variant. Mirrors the Cta secondary look. */
const ARCADE_SECONDARY =
  'inline-flex cursor-pointer items-center justify-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[1.1em] py-[0.7em] font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-105 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

export interface LobbyProps {
  readonly code: string;
  readonly onLeave: () => void;
}

const T: Record<
  Lang,
  {
    room: (code: string) => string;
    share: string;
    reconnecting: string;
    connecting: string;
    start: string;
    waiting: string;
    back: string;
    howToPlay: string;
    hailMary: string;
    hailMaryHint: string;
    turnTimer: string;
    turnTimerHint: string;
    fillBots: string;
    publicTable: string;
    publicHint: string;
    inviteNudge: string;
    reclaimHint: string;
  }
> = {
  en: {
    room: (code) => `Room ${code}`,
    share: 'Share this code with your table.',
    reconnecting: 'Reconnecting…',
    connecting: 'Connecting…',
    start: 'Start the game',
    waiting: 'Waiting for players — add bots to fill the table',
    back: '← Back home',
    howToPlay: 'How to play',
    hailMary: 'Hail-Mary 12 sans atout',
    hailMaryHint: 'Call 12 sans atout and make it to win the whole game — miss and you lose it.',
    turnTimer: 'Turn timer',
    turnTimerHint:
      'Idle players get 60 seconds per turn — then a bot plays for that turn. Good for public tables.',
    fillBots: 'Fill empty seats with bots',
    publicTable: 'List on the public lobby',
    publicHint:
      'On by default — anyone can find and join via Quick Play or Browse. Untick for invite-only.',
    inviteNudge: 'Waiting for players — share the code, or fill the empty seats with bots.',
    reclaimHint: 'One of these seats yours? Log in on the home screen to reclaim it.',
  },
  fr: {
    room: (code) => `Salon ${code}`,
    share: 'Partage ce code avec ta table.',
    reconnecting: 'Reconnexion…',
    connecting: 'Connexion…',
    start: 'Commencer la partie',
    waiting: 'En attente de joueurs — ajoute des bots pour remplir la table',
    back: "← Retour à l'accueil",
    howToPlay: 'Comment jouer',
    hailMary: '12 sans atout — tout ou rien',
    hailMaryHint:
      'Demande 12 sans atout et réussis-la pour gagner toute la partie — rate-la et tu la perds.',
    turnTimer: 'Minuterie de tour',
    turnTimerHint:
      'Les joueurs inactifs ont 60 secondes par tour — ensuite un bot joue ce tour. Idéal pour les tables publiques.',
    fillBots: 'Remplir les sièges vides avec des bots',
    publicTable: 'Afficher dans le salon public',
    publicHint:
      'Activé par défaut — tout le monde peut trouver et rejoindre via Partie rapide ou Parcourir. Décoche pour jouer sur invitation.',
    inviteNudge:
      'En attente de joueurs — partage le code, ou remplis les sièges vides avec des bots.',
    reclaimHint:
      "Un de ces sièges est à toi ? Connecte-toi sur l'écran d'accueil pour le reprendre.",
  },
};

/** Pre-game room: pick a seat, fill the rest with bots, start. */
export function Lobby({ code, onLeave }: LobbyProps) {
  const t = T[useLang()];
  const { roster, viewer, connection, chat } = useGameStore();
  const sendChat = useChatSend();
  const full = roster !== null && roster.seats.every((s) => s !== null);
  const seated = typeof viewer === 'number';
  // House rule ships ON — new rooms start with Hail-Mary enabled (server
  // default matches; unchecking is the deliberate act).
  const hailMary = roster?.rules?.hailMary12 ?? true;
  // Turn timer ships OFF — cozy home games stay untimed unless a host opts in.
  const turnTimer = roster?.rules?.turnTimer ?? false;
  const isPublic = roster?.public ?? false;

  // Any room this browser created (Quick Play or Create a room) is public by
  // default: once we're seated, flip it on. Unticking the toggle below is the
  // deliberate opt-down to invite-only.
  useEffect(() => {
    if (seated && consumeMakePublic(code)) send({ t: 'set_public', on: true });
  }, [seated, code]);

  return (
    <main className="table-felt grid min-h-full place-items-center p-6">
      <NoticeToast />
      <div className="flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="font-arcade-display text-3xl uppercase text-(--color-ap-gold)">
              {t.room(code)}
            </h1>
            <ShareButton code={code} />
          </div>
          <p className="mt-1 text-sm text-(--color-ap-muted)">
            {connection === 'open'
              ? t.share
              : connection === 'reconnecting'
                ? t.reconnecting
                : t.connecting}
          </p>
        </header>

        <SeatPicker
          roster={roster}
          viewer={viewer}
          onSit={(seat) => send({ t: 'sit', seat })}
          onAddBot={(seat, difficulty) => send({ t: 'add_bot', seat, difficulty })}
          onRemoveBot={(seat) => send({ t: 'remove_bot', seat })}
          onKick={(seat) => send({ t: 'kick', seat })}
          {...(roster?.hostSeat !== undefined ? { hostSeat: roster.hostSeat } : {})}
        />

        {/* Quiet invite nudge: seated, not started, and at least one seat is
            still empty (null — bots don't count). */}
        {roster !== null && !roster.started && seated && !full && (
          <p className="flex flex-wrap items-center justify-center gap-2 font-arcade-ui text-xs text-(--color-ap-muted)">
            {t.inviteNudge}
            <ShareButton code={code} />
          </p>
        )}

        {/* Quiet reclaim hint: spectating a full, not-yet-started table — a
            browser that lost its token can log in on Home to get its seat back. */}
        {roster !== null && !roster.started && !seated && full && (
          <p className="text-center font-arcade-ui text-xs text-(--color-ap-muted)">
            {t.reclaimHint}
          </p>
        )}

        {/* One tap instead of three: a solo host fills the table in one go.
            Per-seat Add bot stays for mixed tables (two humans + two bots). */}
        {roster !== null && !roster.started && !full && (
          <Cta
            variant="secondary"
            data-testid="fill-bots"
            className="w-full"
            onClick={() => {
              roster.seats.forEach((s, seat) => {
                if (s === null)
                  send({ t: 'add_bot', seat: seat as 0 | 1 | 2 | 3, difficulty: 'normal' });
              });
            }}
          >
            {t.fillBots}
          </Cta>
        )}

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
            <span className="text-xs leading-snug text-(--color-ap-muted)">{t.hailMaryHint}</span>
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
            <span className="text-xs leading-snug text-(--color-ap-muted)">{t.turnTimerHint}</span>
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

        <Cta onClick={() => send({ t: 'start' })} disabled={!full} className="w-full">
          {full ? t.start : t.waiting}
        </Cta>

        {/* Voice sits inside the chat's send row — one comms surface. */}
        <ChatPanel
          entries={chat}
          onSend={sendChat}
          actions={typeof viewer === 'number' ? <VoiceControls me={viewer} /> : undefined}
        />

        {/* Quiet pre-game moment: about to start — one muted line about
            keeping your games. Gone once anything is linked. */}
        <LinkNudge />

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Cta variant="secondary" onClick={onLeave}>
            {t.back}
          </Cta>
          <HelpButton label={t.howToPlay} className={ARCADE_SECONDARY} />
        </div>
      </div>
    </main>
  );
}
