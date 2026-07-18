import { Seat, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import { getProfile } from '../net/auth.js';
import { PlayerPeek } from './PlayerPeek.js';
import { formatCountdown, useCountdown } from './useCountdown.js';
import type { SeatChipInfo } from './useTableDerived.js';

const T: Record<
  Lang,
  {
    empty: string;
    away: (countdown: string) => string;
    botTakingOver: string;
    peek: (name: string) => string;
  }
> = {
  en: {
    empty: 'empty',
    away: (countdown) => `Away — bot in ${countdown}`,
    botTakingOver: 'Bot taking over…',
    peek: (name) => `Show ${name}'s info`,
  },
  fr: {
    empty: 'libre',
    away: (countdown) => `Absent — bot dans ${countdown}`,
    botTakingOver: 'Le bot prend la relève…',
    peek: (name) => `Voir les infos de ${name}`,
  },
};

export interface SeatChipProps {
  /** Resolved seat display data, or null for a vacant seat. */
  readonly info: SeatChipInfo | null;
  /** On small screens, collapse to the avatar only. */
  readonly compact?: boolean;
  /** Which way the peek popover opens — up for the bottom (you) seat. */
  readonly peekPlacement?: 'up' | 'down';
  /** Horizontal anchor for the peek — 'start'/'end' keep edge seats on-screen. */
  readonly peekAlign?: 'start' | 'center' | 'end';
  /** Mount with the peek already open (scene viewer / tests). */
  readonly defaultPeekOpen?: boolean;
}

/** Owns one player's nameplate + floating bid bubble around the table. Tapping
 * the nameplate opens a small peek with the player's team, connection, and —
 * for your own seat — your record, or a bot's difficulty. */
export function SeatChip({
  info,
  compact = false,
  peekPlacement = 'down',
  peekAlign = 'center',
  defaultPeekOpen = false,
}: SeatChipProps) {
  const t = T[useLang()];
  const secondsLeft = useCountdown(info?.botSwapAt ?? null);
  const [open, setOpen] = useState(defaultPeekOpen);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (info === null) return <span className="text-sm text-(--color-ap-muted)/60">{t.empty}</span>;

  // Your own seat wears your painted card (if any) as its avatar; other seats
  // never receive paint (the roster doesn't carry other players' paint).
  const paint = info.isYou ? getProfile().paint : null;

  return (
    <span ref={rootRef} className="relative inline-block max-w-full min-w-0">
      <Seat
        compact={compact}
        name={info.name}
        team={info.team}
        isTurn={info.isTurn}
        isDealer={info.isDealer}
        isBot={info.isBot}
        isYou={info.isYou}
        youBadge={false}
        connected={info.connected}
        paint={paint}
      />
      {/* Transparent hit target over the presentational nameplate — keeps Seat
          free of interactive descendants (axe-clean) and the whole plate tappable. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.peek(info.name)}
        className="absolute inset-0 z-10 cursor-pointer rounded-(--radius-ap-control)"
      />
      {secondsLeft !== null && (
        <span
          data-testid="botswap-countdown"
          role="status"
          className="pointer-events-none absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-(length:--text-fluid-xs) font-arcade-ui font-semibold whitespace-nowrap text-(--color-ap-text) shadow-(--shadow-ap-sm)"
        >
          {secondsLeft > 0 ? t.away(formatCountdown(secondsLeft)) : t.botTakingOver}
        </span>
      )}
      {info.bidText !== null && (
        <span
          className={`pointer-events-none absolute -top-3 -right-2 z-20 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.6em] py-[0.15em] text-(length:--text-fluid-xs) font-arcade-display shadow-(--shadow-ap-sm) ${
            info.isContract
              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
              : 'bg-(--color-ap-panel) text-(--color-ap-text)'
          }`}
        >
          {info.bidText}
        </span>
      )}
      {open && (
        <span
          className={`absolute z-40 ${
            peekAlign === 'start'
              ? 'left-0'
              : peekAlign === 'end'
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'
          } ${peekPlacement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <PlayerPeek info={info} />
        </span>
      )}
    </span>
  );
}
