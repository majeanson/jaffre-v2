import { Seat } from '@jaffre/ui';
import { formatCountdown, useCountdown } from './useCountdown.js';
import type { SeatChipInfo } from './useTableDerived.js';

export interface SeatChipProps {
  /** Resolved seat display data, or null for a vacant seat. */
  readonly info: SeatChipInfo | null;
  /** On small screens, collapse to the avatar only. */
  readonly compact?: boolean;
}

/** Owns one player's nameplate + floating bid bubble around the table. */
export function SeatChip({ info, compact = false }: SeatChipProps) {
  const secondsLeft = useCountdown(info?.botSwapAt ?? null);
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
      {secondsLeft !== null && (
        <span
          data-testid="botswap-countdown"
          role="status"
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-[0.7em] py-[0.2em] text-(length:--text-fluid-xs) font-semibold whitespace-nowrap text-white shadow"
        >
          {secondsLeft > 0 ? `Away — bot in ${formatCountdown(secondsLeft)}` : 'Bot taking over…'}
        </span>
      )}
      {info.bidText !== null && (
        <span
          className={`absolute -top-3 -right-2 rounded-full px-[0.7em] py-[0.2em] text-(length:--text-fluid-xs) font-bold shadow ${
            info.isContract
              ? 'bg-(--color-lamplight) text-(--color-felt-950)'
              : 'bg-black/70 text-white/80'
          }`}
        >
          {info.bidText}
        </span>
      )}
    </span>
  );
}
