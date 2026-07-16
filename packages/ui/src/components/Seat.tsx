export interface SeatProps {
  readonly name: string;
  readonly team: 0 | 1;
  readonly isTurn?: boolean;
  readonly isDealer?: boolean;
  readonly isBot?: boolean;
  readonly connected?: boolean;
  /** On small screens, collapse to the avatar only (name stays for SR/title). */
  readonly compact?: boolean;
}

/**
 * A player nameplate around the table. Fluid: the root font-size scales with
 * the viewport (like the cards) and every internal size is in em, so the
 * whole plate grows and shrinks as one proportional unit.
 */
export function Seat({
  name,
  team,
  isTurn = false,
  isDealer = false,
  isBot = false,
  connected = true,
  compact = false,
}: SeatProps) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <div
      title={compact ? name : undefined}
      className={`inline-flex max-w-full items-center gap-[0.6em] rounded-(--radius-panel) px-[0.8em] py-[0.5em] text-(length:--text-fluid-sm) bg-(--color-felt-800)/80 shadow-(--shadow-panel) border transition-colors duration-(--duration-flick) ${
        compact ? 'max-sm:gap-0 max-sm:rounded-full max-sm:p-[0.3em]' : ''
      } ${isTurn ? 'border-(--color-accent)' : 'border-white/8'}`}
    >
      <span
        aria-hidden
        className={`relative grid size-[2.3em] shrink-0 place-items-center rounded-full font-display font-semibold text-[1.15em] text-(--color-felt-950) ${
          team === 0 ? 'bg-(--color-team-a)' : 'bg-(--color-team-b)'
        } ${isTurn ? 'ring-2 ring-(--color-accent) ring-offset-2 ring-offset-(--color-felt-900)' : ''}`}
      >
        {initial}
        <span
          title={connected ? 'Connected' : 'Disconnected'}
          className={`absolute -bottom-[0.06em] -right-[0.06em] size-[0.62em] rounded-full border border-(--color-felt-950) ${
            connected ? 'bg-(--color-ok)' : 'bg-(--color-danger)'
          }`}
        />
      </span>
      {compact && <span className="sr-only">{name}</span>}
      <span className={`flex min-w-0 items-center gap-[0.4em] ${compact ? 'max-sm:hidden' : ''}`}>
        <span className="truncate font-semibold text-(--color-ivory)">{name}</span>
        {isBot && (
          <span className="text-[0.62em] uppercase tracking-widest text-(--color-ivory)/50">
            bot
          </span>
        )}
        {isDealer && (
          <span
            title="Dealer"
            className="grid size-[1.15em] shrink-0 place-items-center rounded-full bg-(--color-lamplight)/20 text-[0.62em] font-black text-(--color-lamplight)"
          >
            D<span className="sr-only">ealer</span>
          </span>
        )}
        {isTurn && <span className="sr-only">— their turn to play</span>}
      </span>
    </div>
  );
}
