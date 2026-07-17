import { useLang, type Lang } from '../i18n.js';

const T: Record<
  Lang,
  {
    connected: string;
    disconnected: string;
    playing: string;
    bot: string;
    you: string;
    dealer: string;
    dealerInitial: string;
    dealerRest: string;
    turnSr: string;
  }
> = {
  en: {
    connected: 'Connected',
    disconnected: 'Disconnected',
    playing: 'Playing',
    bot: 'bot',
    you: 'you',
    dealer: 'Dealer',
    dealerInitial: 'D',
    dealerRest: 'ealer',
    turnSr: '— their turn to play',
  },
  fr: {
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    playing: 'Joue',
    bot: 'bot',
    you: 'toi',
    dealer: 'Brasseur',
    dealerInitial: 'B',
    dealerRest: 'rasseur',
    turnSr: '— à son tour de jouer',
  },
};

export interface SeatProps {
  readonly name: string;
  readonly team: 0 | 1;
  readonly isTurn?: boolean;
  readonly isDealer?: boolean;
  readonly isBot?: boolean;
  /** The viewer's own seat — keeps the real name, appends a "(you)" marker. */
  readonly isYou?: boolean;
  readonly connected?: boolean;
  /** On small screens, collapse to the avatar only (name stays for SR/title). */
  readonly compact?: boolean;
}

/**
 * A player nameplate around the table, in the arcade shell: an ink-bordered
 * panel with a hard shadow, a square team-colour avatar with a Silkscreen
 * initial, and the name. The active player's plate takes a violet border.
 * Fluid: the root font-size scales with the viewport and everything inside is
 * in em, so the plate grows and shrinks as one unit.
 *
 * The avatar initial uses `--color-felt-950` (not the constant `--color-ap-ink`)
 * because the team colour flips light↔dark per skin — the felt token flips the
 * opposite way, keeping the initial legible in all three skins.
 */
export function Seat({
  name,
  team,
  isTurn = false,
  isDealer = false,
  isBot = false,
  isYou = false,
  connected = true,
  compact = false,
}: SeatProps) {
  const t = T[useLang()];
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <div
      title={compact ? name : undefined}
      className={`inline-flex max-w-full items-center gap-[0.6em] rounded-(--radius-ap-control) border-2 bg-(--color-ap-panel) px-[0.55em] py-[0.4em] text-(length:--text-fluid-sm) shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) ${
        compact ? 'max-sm:gap-0 max-sm:p-[0.3em]' : ''
      } ${isTurn ? 'border-(--color-ap-violet)' : 'border-(--color-ap-ink)'}`}
    >
      <span
        aria-hidden
        className={`relative grid size-[2.1em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-[1.05em] text-(--color-felt-950) shadow-(--shadow-ap-sm) ${
          team === 0 ? 'bg-(--color-team-a)' : 'bg-(--color-team-b)'
        }`}
      >
        {initial}
        <span
          title={connected ? t.connected : t.disconnected}
          className={`absolute -bottom-[0.12em] -right-[0.12em] size-[0.6em] rounded-full border-2 border-(--color-ap-ink) ${
            connected ? 'bg-(--color-ap-ok)' : 'bg-(--color-ap-danger)'
          }`}
        />
      </span>
      {compact && <span className="sr-only">{name}</span>}
      <span className={`flex min-w-0 items-center gap-[0.4em] ${compact ? 'max-sm:hidden' : ''}`}>
        <span className="truncate font-arcade-ui font-semibold text-(--color-ap-text)">{name}</span>
        {isYou && (
          <span className="shrink-0 font-arcade-display text-[0.55em] uppercase tracking-[0.1em] text-(--color-ap-violet-soft)">
            ({t.you})
          </span>
        )}
        {isTurn ? (
          <span className="font-arcade-display text-[0.6em] uppercase tracking-[0.1em] text-(--color-ap-violet-soft)">
            {t.playing}
          </span>
        ) : (
          isBot && (
            <span className="font-arcade-display text-[0.58em] uppercase tracking-[0.1em] text-(--color-ap-muted)">
              {t.bot}
            </span>
          )
        )}
        {isDealer && (
          <span
            title={t.dealer}
            className="grid size-[1.25em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) font-arcade-display text-[0.6em] text-(--color-ap-ink)"
          >
            {t.dealerInitial}
            <span className="sr-only">{t.dealerRest}</span>
          </span>
        )}
        {isTurn && <span className="sr-only">{t.turnSr}</span>}
      </span>
    </div>
  );
}
