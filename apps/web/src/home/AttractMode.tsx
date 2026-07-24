import { PlayingCard, useLang, type CardData, type Lang } from '@jaffre/ui';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

/** How long the title screen must sit untouched before the attract screen
 * takes over the whole viewport. */
const IDLE_MS = 30_000;

const T: Record<Lang, { tap: string; resume: string }> = {
  en: { tap: 'Tap to continue', resume: 'Resume Jaffre' },
  fr: { tap: 'Touche pour continuer', resume: 'Reprendre Jaffre' },
};

/** One ghost trick, dealt from the four screen edges like four unseen players.
 * The red 0 arrives last and "wins" — everything then sweeps off to the
 * winner's corner, classic attract-screen style. */
const GHOST_TRICK: readonly {
  readonly card: CardData;
  /** Fly-in origin (viewport units, relative to screen centre). */
  readonly from: readonly [string, string];
  /** Resting slot in the centre cluster. */
  readonly to: readonly [string, string];
  readonly rot: number;
}[] = [
  { card: { suit: 'blue', value: 5 }, from: ['-60vw', '0vh'], to: ['-6rem', '0.5rem'], rot: -8 },
  { card: { suit: 'green', value: 7 }, from: ['0vw', '-60vh'], to: ['-1.5rem', '-3rem'], rot: 4 },
  { card: { suit: 'brown', value: 3 }, from: ['60vw', '0vh'], to: ['3.5rem', '0.75rem'], rot: 10 },
  { card: { suit: 'red', value: 0 }, from: ['0vw', '60vh'], to: ['0.5rem', '-0.75rem'], rot: -3 },
];

const CYCLE_S = 16;

/** The whole play loop as one keyframe track: fly in (staggered via
 * animation-delay), rest as a resolved trick, sweep off to the winner, dark. */
const KEYFRAMES = `
@keyframes attract-fly {
  0% { transform: translate(var(--afx), var(--afy)) rotate(var(--afr)); opacity: 0; }
  7% { opacity: var(--ao); }
  10%, 72% { transform: translate(var(--atx), var(--aty)) rotate(var(--atr)); opacity: var(--ao); }
  84%, 100% { transform: translate(45vw, 45vh) rotate(30deg); opacity: 0; }
}
@keyframes attract-hint {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.85; }
}
`;

/**
 * True once the window has been untouched for `ms` (never under
 * prefers-reduced-motion — an attract screen without motion is just clutter).
 * Returns a `wake` to dismiss immediately; the idle timer then restarts, so the
 * attract screen returns after another quiet stretch.
 */
function useIdle(ms: number): readonly [boolean, () => void] {
  const [idle, setIdle] = useState(false);
  const [reset, setReset] = useState<() => void>(() => () => undefined);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer = 0;
    const reset = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    setReset(() => reset);
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [ms]);
  return [idle, reset];
}

/**
 * Arcade attract mode: leave the title screen alone for a while and a
 * full-screen takeover pops OVER everything — the Jaffre wordmark on top, four
 * ghost players dealing a slow trick below (the red 0 wins and the cards sweep
 * to its corner), looping until you touch anything. A single tap anywhere (or
 * any key) dismisses it and drops you straight back where you were. Skipped
 * entirely under reduced motion.
 */
export function AttractMode() {
  const t = T[useLang()];
  const [idle, wake] = useIdle(IDLE_MS);

  // Any global input already resets the idle timer; this is the explicit,
  // immediate dismiss for a tap/click on the overlay itself.
  const dismiss = useCallback(() => {
    wake();
  }, [wake]);

  if (!idle) return null;

  return (
    <div
      className="attract-overlay fixed inset-0 z-[200] flex flex-col items-center justify-center gap-[6vmin] overflow-hidden bg-(--color-ap-ground)"
      onClick={dismiss}
    >
      <style>{KEYFRAMES}</style>

      {/* The Jaffre wordmark, same recipe as the hero banner, anchored up top. */}
      <h1 className="relative z-10 font-arcade-display text-[clamp(3.5rem,13vmin,7.5rem)] leading-none tracking-tight text-(--color-ap-gold) drop-shadow-[4px_4px_0_var(--color-ap-ink)]">
        Jaffre
      </h1>

      {/* Ghost trick, dealt in the centre and looping. */}
      <div aria-hidden className="pointer-events-none relative h-[38vmin] w-full">
        {/* Violet spotlight so the takeover reads as its own mode. It lives
            INSIDE the trick container, centred on the card cluster — a
            viewport offset drifted off-target on every aspect ratio. */}
        <div className="absolute left-1/2 top-1/2 h-[46vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-ap-violet-soft),transparent_70%)] opacity-25" />
        {GHOST_TRICK.map(({ card, from, to, rot }, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2"
            style={
              {
                '--afx': from[0],
                '--afy': from[1],
                '--afr': `${String(rot * 4)}deg`,
                '--atx': to[0],
                '--aty': to[1],
                '--atr': `${String(rot)}deg`,
                '--ao': 0.95,
                opacity: 0,
                animation: `attract-fly ${String(CYCLE_S)}s ease-in-out ${String(i * 1.1)}s infinite`,
              } as CSSProperties
            }
          >
            <span className="block scale-[1.35] max-sm:scale-110">
              <PlayingCard card={card} />
            </span>
          </span>
        ))}
      </div>

      {/* Focusable dismiss so keyboard/screen-reader users get out too — the
          same tap the whole overlay accepts, made explicit and reachable. */}
      <button
        type="button"
        autoFocus
        aria-label={t.resume}
        onClick={dismiss}
        className="relative z-10 cursor-pointer font-arcade-ui text-[clamp(0.9rem,2.6vmin,1.3rem)] tracking-widest text-(--color-ap-text) uppercase [animation:attract-hint_2s_ease-in-out_infinite]"
      >
        {t.tap}
      </button>
    </div>
  );
}
