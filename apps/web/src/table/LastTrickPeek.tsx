import { ARCADE, PlayingCard, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconHistory } from '../components/icons.js';
import type { LastTrickInfo } from './useTableDerived.js';

const T: Record<Lang, { lastTrick: string }> = {
  en: { lastTrick: 'Last trick' },
  fr: { lastTrick: 'Dernière levée' },
};

export interface LastTrickPeekProps {
  readonly trick: LastTrickInfo;
  /** Mount with the popover already open (scene viewer). */
  readonly defaultOpen?: boolean;
}

/** Mini table slots matching the stage: 0 you/bottom, 1 left, 2 top, 3 right. */
const MINI_SLOT: Record<0 | 1 | 2 | 3, string> = {
  0: 'bottom-0 left-1/2 -translate-x-1/2',
  1: 'left-0 top-1/2 -translate-y-1/2',
  2: 'top-0 left-1/2 -translate-x-1/2',
  3: 'right-0 top-1/2 -translate-y-1/2',
};

/**
 * Owns the previous-trick popover: four cards laid out exactly like the
 * table so who-played-what is instantly readable; the winner is raised.
 * Closes on Escape or an outside click.
 */
export function LastTrickPeek({ trick, defaultOpen = false }: LastTrickPeekProps) {
  const t = T[useLang()];
  const [open, setOpen] = useState(defaultOpen);
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
      {/* Icon-only trigger — the aria-label carries the name ("Last trick"). */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t.lastTrick}
        title={t.lastTrick}
        className={ICON_BTN_NEUTRAL}
      >
        <IconHistory />
      </button>
      {open && (
        <div
          className={`${ARCADE.popover} absolute right-0 bottom-full z-30 mb-2 flex flex-col gap-1.5 p-3`}
        >
          <div className="relative size-[clamp(9rem,22vmin,13rem)]">
            {trick.plays.map((play) => (
              <span
                key={`${play.card.suit}-${play.card.value}`}
                className={`absolute ${MINI_SLOT[play.position]}`}
              >
                <PlayingCard
                  card={play.card}
                  size="sm"
                  raised={play.position === trick.winnerPosition}
                />
              </span>
            ))}
          </div>
          <p className="text-center font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted) whitespace-nowrap">
            {trick.winnerName} · {trick.points > 0 ? '+' : ''}
            {trick.points} pt{Math.abs(trick.points) === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
}
