import { SUIT_NAMES, SuitShape, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Suit } from '@jaffre/engine';
import { useGameStore } from '../state/gameStore.js';
import { hold, launchFlight } from './flight.js';

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
  const chipRef = useRef<HTMLSpanElement>(null);

  // useLayoutEffect, not useEffect: the hold has to land before the strip's
  // TrumpBadge paints the real trumpDecided unmasked — a passive effect would
  // fire one paint too late (see flight.ts).
  useLayoutEffect(() => {
    if (view === null || roster === null) return;
    if (!view.trumpDecided || view.trump === null) return;
    if (announcedRound.current === view.roundIndex) return;
    announcedRound.current = view.roundIndex;
    // Joined or reconnected mid-round: trump is old news — skip the fanfare
    // (and the hold: nothing is going to fly, so nothing should wait).
    if (view.capturedTricks.length > 0) return;
    hold('trump');
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

  // Fires the render right after `note` is set above — the chip now exists
  // in the DOM (this component's own subtree just committed), so its rect is
  // ready to measure. Still before paint: chained layout effects all flush
  // in the same synchronous pass, so the strip only ever paints the masked
  // (badge-less) state until this flight actually lands.
  useLayoutEffect(() => {
    if (note === null) return;
    launchFlight({
      from: chipRef.current ?? new DOMRect(),
      to: 'trump',
      key: 'trump',
      payload: (
        <span className="grid size-[2em] place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-gold) bg-(--color-ap-ink)">
          <SuitShape suit={note.suit} size="1em" />
        </span>
      ),
    });
  }, [note]);

  if (note === null) return null;
  const suitName = SUIT_NAMES[lang][note.suit];
  const detail =
    note.by === null ? null : note.by.kind === 'you' ? t.youSetIt : t.setBy(note.by.name);
  return (
    // Positioned by Stage's toast stack (it renders as `announcement`, above
    // the trick banner) — and sized like the trick banner too: it used to be
    // a small pill tucked under the top bar, easy to miss for the least
    // discoverable rule in the game.
    <div
      data-testid="trump-callout"
      role="status"
      className="pop-in pointer-events-none max-w-full"
    >
      <div className="flex items-center gap-[1em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-gold) bg-(--color-ap-ink) px-[1.2em] py-[0.7em] text-(length:--text-fluid-base) shadow-(--shadow-ap-lg)">
        <span ref={chipRef}>
          <SuitShape suit={note.suit} size="2em" />
        </span>
        <span className="flex flex-col gap-[0.15em] leading-tight">
          <span className="font-arcade-display text-[1.1em] uppercase text-white">
            {t.isTrump(suitName)}
          </span>
          {detail !== null && (
            <span className="font-arcade-ui text-[0.85em] font-semibold text-white/75">
              {detail}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
