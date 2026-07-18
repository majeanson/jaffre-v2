import { PlayingCard, type CardData } from '@jaffre/ui';
import { useEffect, useState, type CSSProperties } from 'react';

/** How long the title screen must sit untouched before the ghosts deal in. */
const IDLE_MS = 30_000;

/** One ghost trick, dealt from the four table edges like four unseen players.
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
  { card: { suit: 'blue', value: 5 }, from: ['-60vw', '0vh'], to: ['-4.5rem', '0.5rem'], rot: -8 },
  { card: { suit: 'green', value: 7 }, from: ['0vw', '-60vh'], to: ['-1rem', '-2.5rem'], rot: 4 },
  { card: { suit: 'brown', value: 3 }, from: ['60vw', '0vh'], to: ['2.5rem', '0.75rem'], rot: 10 },
  { card: { suit: 'red', value: 0 }, from: ['0vw', '60vh'], to: ['0.25rem', '-0.5rem'], rot: -3 },
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
`;

/** True once the window has been untouched for `ms` (never under
 * prefers-reduced-motion — an attract screen without motion is just clutter). */
function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer = 0;
    const reset = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [ms]);
  return idle;
}

/**
 * Arcade attract mode: leave the title screen alone for a while and four ghost
 * players deal a slow, faint trick behind the UI — the red 0 wins, the cards
 * sweep to its corner, and the loop repeats until you touch anything. Purely
 * decorative: aria-hidden, pointer-events-none, below the content (-z-10
 * inside the isolated main), and skipped entirely under reduced motion.
 */
export function AttractMode() {
  const idle = useIdle(IDLE_MS);
  if (!idle) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <style>{KEYFRAMES}</style>
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
              '--ao': 0.16,
              opacity: 0,
              animation: `attract-fly ${String(CYCLE_S)}s ease-in-out ${String(i * 1.1)}s infinite`,
            } as CSSProperties
          }
        >
          <PlayingCard card={card} />
        </span>
      ))}
    </div>
  );
}
