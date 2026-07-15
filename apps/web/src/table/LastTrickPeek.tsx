import type { Card } from '@jaffre/engine';
import { PlayingCard } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';

export interface LastTrickPeekProps {
  readonly cards: readonly Card[];
  readonly winnerName: string;
  readonly points: number;
}

/** Owns the click reveal of the previous trick. Closes on Escape or an outside click. */
export function LastTrickPeek({ cards, winnerName, points }: LastTrickPeekProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={GHOST_BTN_SM}
      >
        Last trick
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex flex-col gap-1.5 rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800) p-3 shadow-(--shadow-panel)">
          <div className="flex gap-1.5">
            {cards.map((card) => (
              <PlayingCard key={`${card.suit}-${card.value}`} card={card} size="sm" />
            ))}
          </div>
          <p className="text-[11px] text-(--color-ivory)/65 whitespace-nowrap">
            {winnerName} · {points > 0 ? '+' : ''}
            {points} pt{Math.abs(points) === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
}
