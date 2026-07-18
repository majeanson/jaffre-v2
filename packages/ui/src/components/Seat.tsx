import { useLang, type Lang } from '../i18n.js';
import { TeamGlyph } from './TeamGlyph.js';

/** A stable per-player avatar colour derived from the name, so every seat's
 * pictogram looks different (four "Bot N" no longer collapse to one gold "B").
 * A mid-light pastel so the constant dark initial stays legible in every theme;
 * the team is carried separately by the ☀/☾ glyph, not the avatar colour. */
function seatColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${String(h % 360)} 55% 66%)`;
}

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
  /** Show the visible "(you)" chip (lobby). The table hides it — you already
   * know your own seat — leaving a screen-reader-only marker. */
  readonly youBadge?: boolean;
  readonly connected?: boolean;
  /** On small screens, collapse to the avatar only (name stays for SR/title). */
  readonly compact?: boolean;
  /** The viewer's painted-card art (data URL): shown as their own avatar in
   * place of the initial+hue. Only ever passed for the viewer's own seat. */
  readonly paint?: string | null;
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
  youBadge = true,
  connected = true,
  compact = false,
  paint = null,
}: SeatProps) {
  const t = T[useLang()];
  // "Bot 2" → "B2"; digit-less names take two letters ("Bro" → "Br") so a
  // table of Bot 1/Bot 2/Bro never collapses to look-alike pictograms.
  const digits = /\d+/.exec(name)?.[0];
  const letters = name.replace(/\s+/g, '');
  const initial = `${(letters[0] ?? '?').toUpperCase()}${
    digits ?? (letters[1] ?? '').toLowerCase()
  }`;
  return (
    <div
      title={compact ? name : undefined}
      className={`inline-flex max-w-full items-center gap-[0.6em] rounded-(--radius-ap-control) border-2 bg-(--color-ap-panel) px-[0.55em] py-[0.4em] text-(length:--text-fluid-sm) shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) ${
        compact
          ? 'max-sm:gap-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none'
          : ''
      } ${isTurn ? 'border-(--color-ap-violet)' : 'border-(--color-ap-ink)'}`}
    >
      <span
        aria-hidden
        style={paint === null ? { background: seatColor(name) } : undefined}
        className={`relative grid size-[2.1em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 font-arcade-display text-(--color-ap-ink) shadow-(--shadow-ap-sm) ${
          initial.length > 1 ? 'text-[0.78em]' : 'text-[1.05em]'
        } ${
          // Phone table seats are avatar-only: scale the token up (the em box
          // rides the font) so it reads as a person, not a speck on the felt.
          compact ? (initial.length > 1 ? 'max-sm:text-[1.35em]' : 'max-sm:text-[1.8em]') : ''
        } ${
          // With the plate chrome gone on small screens, the avatar itself
          // carries the turn indicator.
          compact && isTurn ? 'max-sm:border-(--color-ap-violet)' : ''
        } border-(--color-ap-ink)`}
      >
        {paint !== null ? (
          // Your personalised avatar: the painting fills the plate; its own
          // rounding matches so the corner badges (siblings) stay unclipped.
          <img
            src={paint}
            alt=""
            className="absolute inset-0 size-full rounded-[calc(var(--radius-ap-inner)-0.1em)] object-cover"
          />
        ) : (
          initial
        )}
        {/* team pictogram, corner-badged on the avatar — small and tucked into
            the corner so it never covers the face. */}
        <span className="absolute -top-[0.28em] -left-[0.28em] grid size-[0.8em] place-items-center rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-panel)">
          <TeamGlyph team={team} size="0.5em" />
        </span>
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
        {isYou &&
          (youBadge ? (
            <span className="shrink-0 font-arcade-display text-[0.55em] uppercase tracking-[0.1em] text-(--color-ap-violet-soft)">
              ({t.you})
            </span>
          ) : (
            <span className="sr-only">({t.you})</span>
          ))}
        {isTurn && !isYou ? (
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
