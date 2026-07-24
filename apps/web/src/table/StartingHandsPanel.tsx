import type { Card } from '@jaffre/engine';
import { cardId } from '@jaffre/engine';
import { PlayingCard, useLang, type Lang } from '@jaffre/ui';
import { useState } from 'react';

const T: Record<
  Lang,
  { show: string; hide: string; region: string; roundRegion: (round: number) => string }
> = {
  en: {
    show: 'Show starting hands',
    hide: 'Hide starting hands',
    region: 'Starting hands',
    roundRegion: (round) => `Round ${String(round)} starting hands`,
  },
  fr: {
    show: 'Voir les mains de départ',
    hide: 'Cacher les mains de départ',
    region: 'Mains de départ',
    roundRegion: (round) => `Mains de départ de la ronde ${String(round)}`,
  },
};

/** Sun = seats 0 & 2 (team A), Moon = seats 1 & 3 (team B). */
const TEAM_COLOR = ['var(--color-team-a)', 'var(--color-team-b)'] as const;

/** Deal order isn't sorted; group each hand by suit then rank so it reads. */
const SUIT_ORDER = ['red', 'brown', 'green', 'blue'] as const;
function sortHand(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort(
    (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.value - b.value,
  );
}

/**
 * The four seats' starting hands as compact rows — one row per player: their
 * name, then their 8 cards fanned tight (overlapping so a full hand fits even
 * on a phone). Read-only; no toggle of its own — {@link StartingHandsPanel}
 * wraps it with an expander, or a caller can drop it straight in already-open.
 */
export function StartingHandsRows({
  hands,
  names,
}: {
  readonly hands: readonly (readonly Card[])[];
  readonly names: readonly string[];
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {[0, 1, 2, 3].map((seat) => (
        <li key={seat} className="flex items-center gap-2">
          <span
            className="w-[3.5rem] shrink-0 truncate font-arcade-ui text-[0.72em] font-semibold"
            style={{ color: TEAM_COLOR[seat % 2] }}
            title={names[seat] ?? '—'}
          >
            {names[seat] ?? '—'}
          </span>
          {/* Overlap every card after the first so a full 8-card hand stays
              inside the modal width; each card's top-left rank stays visible. */}
          <span className="flex [&>*:not(:first-child)]:-ml-[0.95rem]">
            {sortHand(hands[seat] ?? []).map((card) => (
              <PlayingCard key={cardId(card)} card={card} size="sm" />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * {@link StartingHandsRows} boxed for the ivory scorepad: team colors need the
 * dark panel, not the pad's paper, so the rows sit in their own inset. This is
 * what a scoresheet's `renderRoundDetail` unfolds under an R-row — the same
 * reveal wherever a `ScorePad` appears (top bar, round summary).
 */
export function StartingHandsInset({
  round,
  hands,
  names,
}: {
  readonly round: number;
  readonly hands: readonly (readonly Card[])[];
  readonly names: readonly string[];
}) {
  const t = T[useLang()];
  return (
    <div
      role="region"
      aria-label={t.roundRegion(round)}
      className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-2"
    >
      <StartingHandsRows hands={hands} names={names} />
    </div>
  );
}

/**
 * {@link StartingHandsRows} behind a collapsed-by-default expander, so the
 * showcase never overwhelms the round-summary / recap it sits under.
 */
export function StartingHandsPanel({
  hands,
  names,
  defaultOpen = false,
}: {
  readonly hands: readonly (readonly Card[])[];
  readonly names: readonly string[];
  readonly defaultOpen?: boolean;
}) {
  const t = T[useLang()];
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-1.5 font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.12em] text-(--color-ap-muted) transition-colors hover:text-(--color-ap-text)"
      >
        {open ? t.hide : t.show}
        <span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div role="region" aria-label={t.region} className="mt-2">
          <StartingHandsRows hands={hands} names={names} />
        </div>
      )}
    </div>
  );
}
