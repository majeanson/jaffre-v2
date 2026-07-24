import { Seat, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import { getProfile } from '../net/auth.js';
import { useGameStore } from '../state/gameStore.js';
import { PlayerPeek } from './PlayerPeek.js';
import { formatCountdown, useCountdown } from './useCountdown.js';
import type { SeatChipInfo } from './useTableDerived.js';

/** The turn-timer nudge stays hidden until this many seconds remain — a
 * present player quietly thinking must not be badged the moment their turn
 * starts, only when the bot is genuinely about to play for them. */
const TURN_TIMER_WARN_S = 20;

const T: Record<
  Lang,
  {
    empty: string;
    away: (countdown: string) => string;
    turnTimer: (countdown: string) => string;
    botTakingOver: string;
    autoPlay: string;
    peek: (name: string) => string;
  }
> = {
  en: {
    empty: 'empty',
    away: (countdown) => `Away — bot in ${countdown}`,
    turnTimer: (countdown) => `Bot plays in ${countdown}`,
    botTakingOver: 'Bot taking over…',
    autoPlay: 'Auto-play — bot playing',
    peek: (name) => `Show ${name}'s info`,
  },
  fr: {
    empty: 'libre',
    away: (countdown) => `Absent — bot dans ${countdown}`,
    turnTimer: (countdown) => `Le bot joue dans ${countdown}`,
    botTakingOver: 'Le bot prend la relève…',
    autoPlay: 'Jeu auto — le bot joue',
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
  const clockSkew = useGameStore((s) => s.clockSkew);
  const secondsLeft = useCountdown(info?.botSwapAt ?? null, clockSkew);
  const turnSecondsLeft = useCountdown(info?.turnTimerAt ?? null, clockSkew);
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

  // Everything floated off the chip (countdown pill, peek) shares this anchor
  // so edge seats never spill a centered pill off a narrow screen.
  const alignX =
    peekAlign === 'start'
      ? 'left-0'
      : peekAlign === 'end'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  // Your own seat wears your painted card (if any); bot seats wear their pixel
  // sprite; other humans never receive paint (the roster doesn't carry it).
  const paint = info.isYou ? getProfile().paint : info.avatar;

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
          className={`pointer-events-none absolute z-20 w-max max-w-[min(11rem,44vw)] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-text) shadow-(--shadow-ap-sm) ${alignX} ${
            peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {secondsLeft > 0 ? t.away(formatCountdown(secondsLeft)) : t.botTakingOver}
        </span>
      )}
      {/* Turn-timer nudge: this human is PRESENT, just idle on their turn.
          Hidden until the final stretch — never labeled "Away". */}
      {secondsLeft === null && turnSecondsLeft !== null && turnSecondsLeft <= TURN_TIMER_WARN_S && (
        <span
          data-testid="turntimer-countdown"
          role="status"
          className={`pointer-events-none absolute z-20 w-max max-w-[min(11rem,44vw)] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-text) shadow-(--shadow-ap-sm) ${alignX} ${
            peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {turnSecondsLeft > 0 ? t.turnTimer(formatCountdown(turnSecondsLeft)) : t.botTakingOver}
        </span>
      )}
      {/* Voluntary auto-play: a bot is covering this connected human's turns.
          Distinct from the disconnect countdown (which only shows when away). */}
      {secondsLeft === null && info.autoPlay && (
        <span
          data-testid="autoplay-badge"
          role="status"
          className={`pointer-events-none absolute z-20 w-max max-w-[min(11rem,44vw)] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-ink) shadow-(--shadow-ap-sm) ${alignX} ${
            peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {t.autoPlay}
        </span>
      )}
      {info.bidText !== null && (
        <span
          className={`pointer-events-none absolute -top-3 z-20 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.6em] py-[0.15em] text-(length:--text-fluid-xs) font-arcade-display shadow-(--shadow-ap-sm) ${
            peekAlign === 'end' ? '-left-2' : '-right-2'
          } ${
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
          className={`absolute z-40 ${alignX} ${
            peekPlacement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <PlayerPeek info={info} />
        </span>
      )}
    </span>
  );
}
