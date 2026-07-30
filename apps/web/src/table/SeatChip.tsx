import { Seat, useLang, type Lang } from '@jaffre/ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getProfile } from '../net/auth.js';
import { send } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { useDismissLayer } from '../keys/layers.js';
import { PlayerPeek } from './PlayerPeek.js';
import { formatCountdown, useCountdown } from './useCountdown.js';
import type { SeatChipInfo } from './useTableDerived.js';

/** The turn-timer nudge stays hidden until this many seconds remain — a
 * present player quietly thinking must not be badged the moment their turn
 * starts, only when the bot is genuinely about to play for them. */
const TURN_TIMER_WARN_S = 20;

/** Breathing room the peek keeps from every viewport edge, in px. */
const PEEK_MARGIN = 8;

const T: Record<
  Lang,
  {
    empty: string;
    away: (countdown: string) => string;
    awayBotPlaying: string;
    turnTimer: (countdown: string) => string;
    imHere: string;
    botTakingOver: string;
    autoPlay: string;
    peek: (name: string) => string;
  }
> = {
  en: {
    empty: 'empty',
    away: (countdown) => `Away — bot in ${countdown}`,
    awayBotPlaying: 'Away — bot playing',
    turnTimer: (countdown) => `Bot plays in ${countdown}`,
    imHere: "— I'm here",
    botTakingOver: 'Bot taking over…',
    autoPlay: 'Auto-play — bot playing',
    peek: (name) => `Show ${name}'s info`,
  },
  fr: {
    empty: 'libre',
    away: (countdown) => `Absent — bot dans ${countdown}`,
    awayBotPlaying: 'Absent — le bot joue',
    turnTimer: (countdown) => `Le bot joue dans ${countdown}`,
    imHere: '— je suis là',
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

/**
 * Optimistic auto-play toggle (G7): mirrors the turn-timer "I'm here" pattern
 * above — `dismissedFor` flips the display immediately on the tap that
 * requested it, ahead of the round-trip that confirms it. Here, `override`
 * IS the requested value; it self-clears the instant the roster echo
 * (`actual`) catches up, so a later externally-driven change (e.g. the
 * server flipping it off itself) is never masked — once the request is
 * fulfilled there is nothing left worth preferring over the truth.
 */
export function useOptimisticAutoPlay(actual: boolean): {
  readonly on: boolean;
  readonly toggle: (send: (next: boolean) => void) => void;
} {
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (override !== null && actual === override) setOverride(null);
  }, [actual, override]);
  return {
    on: override ?? actual,
    toggle: (send) => {
      const next = !(override ?? actual);
      setOverride(next);
      send(next);
    },
  };
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
  // "I'm here" tapped for THIS deadline: hide the nudge immediately instead
  // of waiting the round-trip for the roster's reset turnTimerAt.
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const [open, setOpen] = useState(defaultPeekOpen);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const peekRef = useRef<HTMLSpanElement>(null);
  // The peek is wider than most chips, and the felt clips its overflow, so an
  // anchored absolute box gets guillotined on edge seats. Measure instead:
  // place it in the viewport, then clamp it inside the screen. It renders in a
  // body portal — the seat containers carry `-translate-x-1/2`, and a transform
  // makes even a `fixed` child position against THAT box, not the viewport.
  const [peekPos, setPeekPos] = useState<{ left: number; top: number } | null>(null);

  const placePeek = useCallback(() => {
    const anchor = rootRef.current?.getBoundingClientRect();
    const peek = peekRef.current?.getBoundingClientRect();
    if (anchor === undefined || peek === undefined) return;
    const desiredLeft =
      peekAlign === 'start'
        ? anchor.left
        : peekAlign === 'end'
          ? anchor.right - peek.width
          : anchor.left + anchor.width / 2 - peek.width / 2;
    const desiredTop =
      peekPlacement === 'up' ? anchor.top - peek.height - PEEK_MARGIN : anchor.bottom + PEEK_MARGIN;
    const clamp = (value: number, extent: number, viewport: number) =>
      // A panel taller/wider than the viewport pins to the top/left edge
      // rather than sliding off the far one.
      Math.max(PEEK_MARGIN, Math.min(value, viewport - extent - PEEK_MARGIN));
    setPeekPos({
      left: clamp(desiredLeft, peek.width, window.innerWidth),
      top: clamp(desiredTop, peek.height, window.innerHeight),
    });
  }, [peekAlign, peekPlacement]);

  useLayoutEffect(() => {
    if (!open) {
      setPeekPos(null);
      return undefined;
    }
    placePeek();
    // The felt reflows on rotate/resize and the peek must follow, not linger
    // over a chip that has moved out from under it.
    window.addEventListener('resize', placePeek);
    window.addEventListener('scroll', placePeek, true);
    return () => {
      window.removeEventListener('resize', placePeek);
      window.removeEventListener('scroll', placePeek, true);
    };
  }, [open, placePeek]);

  // Escape and the trip back to the chip come from the app-wide stack; the
  // outside-tap dismissal below is this popover's own business.
  useDismissLayer(
    peekRef,
    () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
    { enabled: open, initialFocus: () => null, restoreFocus: false },
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The peek lives in a portal, so it is outside rootRef's subtree — test
      // both, or a tap inside the panel would dismiss it.
      const inside =
        (rootRef.current?.contains(target) ?? false) ||
        (peekRef.current?.contains(target) ?? false);
      if (!inside) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
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

  // Your own seat wears your LOCAL profile paint (instant on load, no roster
  // round-trip needed); bot seats wear their pixel sprite; other humans wear
  // the paint the roster already carries for them (info.avatar — resolved in
  // useTableDerived alongside everyone else's).
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
          {/* At zero the deadline has passed — the bot IS playing now (the
              next roster replaces this with the steady botPlaying badge). */}
          {secondsLeft > 0 ? t.away(formatCountdown(secondsLeft)) : t.awayBotPlaying}
        </span>
      )}
      {/* Steady state after the swap deadline: the seat's human is away and a
          bot is covering their turns until they return. No countdown — a
          count pinned at zero ("Bot taking over…" forever) was a bug. */}
      {secondsLeft === null && info.botPlaying && (
        <span
          data-testid="botplaying-badge"
          role="status"
          className={`pointer-events-none absolute z-20 w-max max-w-[min(11rem,44vw)] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-text) shadow-(--shadow-ap-sm) ${alignX} ${
            peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {t.awayBotPlaying}
        </span>
      )}
      {/* Turn-timer nudge: this human is PRESENT, just idle on their turn.
          Hidden until the final stretch — never labeled "Away". Suppressed
          when auto-play is on: the bot already covers this turn, so the
          countdown pill would just stack with the auto-play badge below.
          YOUR OWN nudge is a button — tapping "I'm here" restarts the turn
          clock server-side and hides the pill on the spot. */}
      {secondsLeft === null &&
        !info.botPlaying &&
        !info.autoPlay &&
        turnSecondsLeft !== null &&
        turnSecondsLeft <= TURN_TIMER_WARN_S &&
        (info.turnTimerAt ?? null) !== dismissedFor &&
        (info.isYou && turnSecondsLeft > 0 ? (
          <button
            type="button"
            data-testid="turntimer-countdown"
            onClick={() => {
              setDismissedFor(info.turnTimerAt ?? null);
              send({ t: 'im_here' });
            }}
            className={`absolute z-30 w-max max-w-[min(13rem,56vw)] cursor-pointer rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover) ${alignX} ${
              peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            {t.turnTimer(formatCountdown(turnSecondsLeft))}{' '}
            <span className="text-(--color-ap-ok)">{t.imHere}</span>
          </button>
        ) : (
          <span
            data-testid="turntimer-countdown"
            role="status"
            className={`pointer-events-none absolute z-20 w-max max-w-[min(11rem,44vw)] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] text-center text-(length:--text-fluid-xs) font-arcade-ui font-semibold text-(--color-ap-text) shadow-(--shadow-ap-sm) ${alignX} ${
              peekPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            {turnSecondsLeft > 0 ? t.turnTimer(formatCountdown(turnSecondsLeft)) : t.botTakingOver}
          </span>
        ))}
      {/* Voluntary auto-play: a bot is covering this connected human's turns.
          Distinct from the disconnect countdown (which only shows when away). */}
      {secondsLeft === null && !info.botPlaying && info.autoPlay && (
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
      {open &&
        createPortal(
          <span
            ref={peekRef}
            // Hidden for the single frame before the measurement lands, so the
            // panel never flashes at an unclamped spot.
            className={`fixed z-40 ${peekPos === null ? 'invisible' : ''}`}
            style={{ top: peekPos?.top ?? 0, left: peekPos?.left ?? 0 }}
          >
            <PlayerPeek info={info} />
          </span>,
          document.body,
        )}
    </span>
  );
}
