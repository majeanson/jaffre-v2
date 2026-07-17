import { Seat, useLang, type Lang } from '@jaffre/ui';
import { formatCountdown, useCountdown } from './useCountdown.js';
import type { SeatChipInfo } from './useTableDerived.js';

const T: Record<
  Lang,
  { empty: string; away: (countdown: string) => string; botTakingOver: string }
> = {
  en: {
    empty: 'empty',
    away: (countdown) => `Away — bot in ${countdown}`,
    botTakingOver: 'Bot taking over…',
  },
  fr: {
    empty: 'libre',
    away: (countdown) => `Absent — bot dans ${countdown}`,
    botTakingOver: 'Le bot prend la relève…',
  },
};

export interface SeatChipProps {
  /** Resolved seat display data, or null for a vacant seat. */
  readonly info: SeatChipInfo | null;
  /** On small screens, collapse to the avatar only. */
  readonly compact?: boolean;
}

/** Owns one player's nameplate + floating bid bubble around the table. */
export function SeatChip({ info, compact = false }: SeatChipProps) {
  const t = T[useLang()];
  const secondsLeft = useCountdown(info?.botSwapAt ?? null);
  if (info === null) return <span className="text-sm text-(--color-ap-muted)/60">{t.empty}</span>;
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
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-(length:--text-fluid-xs) font-arcade-ui font-semibold whitespace-nowrap text-(--color-ap-text) shadow-(--shadow-ap-sm)"
        >
          {secondsLeft > 0 ? t.away(formatCountdown(secondsLeft)) : t.botTakingOver}
        </span>
      )}
      {info.bidText !== null && (
        <span
          className={`absolute -top-3 -right-2 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.6em] py-[0.15em] text-(length:--text-fluid-xs) font-arcade-display shadow-(--shadow-ap-sm) ${
            info.isContract
              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
              : 'bg-(--color-ap-panel) text-(--color-ap-text)'
          }`}
        >
          {info.bidText}
        </span>
      )}
    </span>
  );
}
