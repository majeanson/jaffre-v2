export interface SeatProps {
  readonly name: string;
  readonly team: 0 | 1;
  readonly isTurn?: boolean;
  readonly isDealer?: boolean;
  readonly isBot?: boolean;
  readonly connected?: boolean;
  readonly cardCount?: number;
}

/** A player nameplate around the table. */
export function Seat({
  name,
  team,
  isTurn = false,
  isDealer = false,
  isBot = false,
  connected = true,
  cardCount,
}: SeatProps) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <div
      className={`inline-flex items-center gap-2.5 rounded-(--radius-panel) px-3 py-2 bg-(--color-felt-800)/80 shadow-(--shadow-panel) border transition-colors duration-(--duration-flick) ${
        isTurn ? 'border-(--color-accent)' : 'border-white/8'
      }`}
    >
      <span
        aria-hidden
        className={`relative grid size-9 place-items-center rounded-full font-display font-semibold text-lg text-(--color-felt-950) ${
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
      <span className="flex flex-col leading-tight">
        <span className="font-semibold text-sm text-(--color-ivory)">
          {name}
          {isBot && (
            <span className="ml-1.5 text-[10px] uppercase tracking-widest opacity-60">bot</span>
          )}
        </span>
        <span className="flex gap-1.5 text-[11px] text-(--color-ivory)/55 tabular-nums">
          {isDealer && <span className="text-(--color-lamplight)">Dealer ·</span>}
          {cardCount !== undefined && <span>{cardCount} cards</span>}
          {isTurn && <span className="text-(--color-accent)">· to play</span>}
        </span>
      </span>
    </div>
  );
}
