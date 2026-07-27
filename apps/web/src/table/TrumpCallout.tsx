import { SUIT_NAMES, SuitShape, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import type { Suit } from '@jaffre/engine';
import { useGameStore } from '../state/gameStore.js';

const T: Record<
  Lang,
  {
    isTrump: (suit: string) => string;
    setBy: (name: string) => string;
    youSetIt: string;
  }
> = {
  en: {
    isTrump: (suit) => `${suit} is trump`,
    setBy: (name) => `${name} led it first`,
    youSetIt: 'you led it first',
  },
  fr: {
    isTrump: (suit) => `L’atout est ${suit}`,
    setBy: (name) => `${name} l’a joué en premier`,
    youSetIt: 'tu l’as joué en premier',
  },
};

const SHOW_MS = 4000;

/**
 * One-shot per round: the moment trump is set by the declarer's first lead,
 * announce it in plain words over the felt. The least discoverable rule in the
 * game used to surface only as a small badge in the score strip (plus one
 * practice-only coach-mark) — this tells everyone, every round. The TrumpBadge
 * in the strip stays as the persistent echo.
 */
export function TrumpCallout() {
  const lang = useLang();
  const t = T[lang];
  const view = useGameStore((s) => s.view);
  const roster = useGameStore((s) => s.roster);
  const viewer = useGameStore((s) => s.viewer);
  const [note, setNote] = useState<{
    suit: Suit;
    by: { kind: 'you' } | { kind: 'name'; name: string } | null;
  } | null>(null);
  const announcedRound = useRef(-1);

  useEffect(() => {
    if (view === null || roster === null) return;
    if (!view.trumpDecided || view.trump === null) return;
    if (announcedRound.current === view.roundIndex) return;
    announcedRound.current = view.roundIndex;
    // Joined or reconnected mid-round: trump is old news — skip the fanfare.
    if (view.capturedTricks.length > 0) return;
    const declarer = view.contract?.seat ?? null;
    const name = declarer !== null ? (roster.seats[declarer]?.name ?? null) : null;
    const by =
      declarer !== null && viewer === declarer
        ? ({ kind: 'you' } as const)
        : name !== null
          ? ({ kind: 'name', name } as const)
          : null;
    setNote({ suit: view.trump, by });
  }, [view, roster, viewer]);

  // The note retires on its own; a fresh note restarts the clock.
  useEffect(() => {
    if (note === null) return undefined;
    const timer = setTimeout(() => setNote(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [note]);

  if (note === null) return null;
  const suitName = SUIT_NAMES[lang][note.suit];
  const detail =
    note.by === null ? null : note.by.kind === 'you' ? t.youSetIt : t.setBy(note.by.name);
  return (
    <div
      data-testid="trump-callout"
      role="status"
      className="pop-in pointer-events-none fixed left-1/2 top-[4.75rem] z-20 -translate-x-1/2 max-sm:top-[4.25rem]"
    >
      <div className="flex items-center gap-[0.6em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-gold) bg-(--color-ap-ink) px-[1em] py-[0.5em] text-(length:--text-fluid-sm) shadow-(--shadow-ap-lg)">
        <SuitShape suit={note.suit} size="1.4em" />
        <span className="flex flex-col leading-tight">
          <span className="font-arcade-display text-[1em] uppercase text-white">
            {t.isTrump(suitName)}
          </span>
          {detail !== null && (
            <span className="font-arcade-ui text-[0.8em] text-white/75">{detail}</span>
          )}
        </span>
      </div>
    </div>
  );
}
