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

/** A player nameplate around the table. */
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
      className={`inline-flex max-w-full items-center gap-2.5 rounded-(--radius-panel) px-3 py-2 bg-(--color-felt-800)/80 shadow-(--shadow-panel) border transition-colors duration-(--duration-flick) max-sm:gap-1.5 max-sm:px-2 max-sm:py-1 ${
        compact ? 'max-sm:gap-0 max-sm:rounded-full max-sm:p-1' : ''
      } ${isTurn ? 'border-(--color-accent)' : 'border-white/8'}`}
    >
      <span
        aria-hidden
        className={`relative grid size-9 shrink-0 place-items-center rounded-full font-display font-semibold text-lg text-(--color-felt-950) max-sm:size-7 max-sm:text-sm ${
          team === 0 ? 'bg-(--color-lamplight)' : 'bg-(--color-ivory)'
        } ${isTurn ? 'ring-2 ring-(--color-accent) ring-offset-2 ring-offset-(--color-felt-900)' : ''}`}
      >
        {initial}
        <span
          title={connected ? 'Connected' : 'Disconnected'}
          className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-(--color-felt-950) ${
            connected ? 'bg-(--color-ok)' : 'bg-(--color-danger)'
          }`}
        />
      </span>
      {compact && <span className="sr-only">{name}</span>}
      <span className={`flex min-w-0 items-center gap-1.5 ${compact ? 'max-sm:hidden' : ''}`}>
        <span className="truncate font-semibold text-sm text-(--color-ivory) max-sm:text-xs">
          {name}
        </span>
        {isBot && (
          <span className="text-[9px] uppercase tracking-widest text-(--color-ivory)/50">bot</span>
        )}
        {isDealer && (
          <span
            title="Dealer"
            className="grid size-4 shrink-0 place-items-center rounded-full bg-(--color-lamplight)/20 text-[9px] font-black text-(--color-lamplight)"
          >
            D<span className="sr-only">ealer</span>
          </span>
        )}
        {isTurn && <span className="sr-only">— their turn to play</span>}
      </span>
    </div>
  );
}
