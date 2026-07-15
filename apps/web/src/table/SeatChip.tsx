import { Seat } from '@jaffre/ui';
import type { SeatChipInfo } from './useTableDerived.js';

export interface SeatChipProps {
  /** Resolved seat display data, or null for a vacant seat. */
  readonly info: SeatChipInfo | null;
  /** On small screens, collapse to the avatar only. */
  readonly compact?: boolean;
}

/** Owns one player's nameplate + floating bid bubble around the table. */
export function SeatChip({ info, compact = false }: SeatChipProps) {
  if (info === null) return <span className="text-sm text-(--color-ivory)/40">empty</span>;
  return (
    <span className="relative inline-block max-w-full min-w-0">
      <Seat
        compact={compact}
        name={info.name}
        team={info.team}
        isTurn={info.isTurn}
        isDealer={info.isDealer}
        isBot={info.isBot}
        connected={info.connected}
      />
      {info.bidText !== null && (
        <span
          className={`absolute -top-3 -right-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow ${
            info.isContract
              ? 'bg-(--color-lamplight) text-(--color-felt-950)'
              : 'bg-black/70 text-(--color-ivory)/80'
          }`}
        >
          {info.bidText}
        </span>
      )}
    </span>
  );
}
