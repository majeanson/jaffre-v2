import { ARCADE, useLang, type Lang } from '@jaffre/ui';
import type { ReactNode } from 'react';
import { IconButton } from '../components/IconButton.js';
import { IconRobot } from '../components/icons.js';
import { useGameStore } from '../state/gameStore.js';
import { LastTrickPeek } from './LastTrickPeek.js';
import { SeatChip } from './SeatChip.js';
import type { LastTrickInfo, SeatChipInfo } from './useTableDerived.js';

const T: Record<Lang, { autoPlay: string; watching: (n: number) => string }> = {
  en: {
    autoPlay: 'Auto-play — let a hard bot take your turns while you step away',
    watching: (n) => `${String(n)} watching`,
  },
  fr: {
    autoPlay: 'Jeu auto — un bot fort joue tes tours pendant que tu t’absentes',
    watching: (n) => `${String(n)} spectateur·rices`,
  },
};

/** A small eye glyph — spectators aren't seated, but the felt shouldn't
 * pretend nobody's watching. */
function EyeGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Eye+count chip — read straight off the roster (no prop plumbing needed
 * from whatever screen mounts UtilityRow, so it stays true regardless of what
 * that caller threads through). `n` is already known > 0 by the caller. */
function SpectatorsCell({ n }: { readonly n: number }) {
  const t = T[useLang()];
  return (
    <span
      data-testid="spectator-chip"
      title={t.watching(n)}
      className="inline-flex h-[clamp(2.5rem,4.8vmin,2.6rem)] shrink-0 items-center gap-1 px-[0.6em] text-(length:--text-fluid-base) text-(--color-ap-muted)"
    >
      <EyeGlyph />
      <span className="font-arcade-ui text-[0.6em]">{n}</span>
    </span>
  );
}

/** Voluntary auto-play toggle, as a cell of the utility bar — it belongs next
 * to the hand you're handing over, not buried in the Options drawer. */
function AutoPlayCell({ on, onToggle }: { readonly on: boolean; readonly onToggle: () => void }) {
  const t = T[useLang()];
  return (
    <IconButton plain label={t.autoPlay} aria-pressed={on} active={on} onClick={onToggle}>
      <IconRobot />
    </IconButton>
  );
}

export interface UtilityRowProps {
  /** Your own seat chip (table-relative position 0). */
  readonly you: SeatChipInfo | null;
  /** Previous trick for the peek popover; null hides the button. */
  readonly lastTrick: LastTrickInfo | null;
  /** Scene viewer: mount with the peek popover already open. */
  readonly defaultLastTrickOpen?: boolean;
  /** Voice + chat controls slot (online rooms only). */
  readonly comms?: ReactNode;
  /** Voluntary auto-play toggle (online rooms only) — omitted in practice. */
  readonly autoPlay?: { readonly on: boolean; readonly onToggle: () => void } | undefined;
  /** Sort-hand button — grouped with chat at the row's end. */
  readonly sort?: ReactNode;
  /** Always-visible help trigger — the rules one tap from the felt, not two
   * taps behind the score strip's Options drawer. */
  readonly help?: ReactNode;
  /** Spectators only: back to the seat-takeover gate. */
  readonly takeSeat?: ReactNode;
}

/** A full-height ink separator between the bar's cells. */
function Divider() {
  return <span aria-hidden className={`${ARCADE.divider} self-stretch`} />;
}

/** Owns the slim row above the hand: your chip centered, and ONE bordered bar
 * of utility buttons — last-trick, chat, sort — as borderless cells separated
 * by ink lines (the bar owns the border/shadow, not each button). */
export function UtilityRow({
  you,
  lastTrick,
  defaultLastTrickOpen = false,
  comms,
  autoPlay,
  sort,
  help,
  takeSeat,
}: UtilityRowProps) {
  const hasComms = comms !== undefined && comms !== null && comms !== false;
  const hasSort = sort !== undefined && sort !== null && sort !== false;
  const hasHelp = help !== undefined && help !== null && help !== false;
  const hasTakeSeat = takeSeat !== undefined && takeSeat !== null && takeSeat !== false;
  // Nobody's watching is the common case — a chip that's usually a silent
  // "0" would just be noise, so it's absent entirely rather than disabled.
  const spectators = useGameStore((s) => s.roster?.spectators ?? 0);
  const hasSpectators = spectators > 0;
  return (
    <div className="relative z-30 flex w-full max-w-[min(96vw,100rem)] items-center justify-end gap-2 py-1 sm:grid sm:grid-cols-[1fr_auto_1fr]">
      <span aria-hidden className="max-sm:hidden" />
      {/* Your own seat. Desktop: centered under the felt, the bottom seat
          mirroring the top opponent so all four read as sat around the table.
          Phone: tucked right beside the utility bar — the bottom rim stays
          one slim right-aligned cluster and the felt keeps the width. */}
      {/* data-deal-target: DealIntro measures this rect so the round-start
          deal flies YOUR cards to your own chip, wherever the layout put it. */}
      <span data-deal-target="0" className="min-w-0 sm:justify-self-center">
        <SeatChip info={you} peekPlacement="up" peekAlign="end" />
      </span>
      {/* No overflow-hidden here: the last-trick and chat popovers anchor to
          their cells and must escape the bar's box. */}
      <span className="flex shrink-0 items-stretch gap-[2px] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[2px] shadow-(--shadow-ap-sm) sm:justify-self-end">
        <LastTrickPeek trick={lastTrick} defaultOpen={defaultLastTrickOpen} />
        {hasSpectators && <Divider />}
        {hasSpectators && <SpectatorsCell n={spectators} />}
        {hasComms && <Divider />}
        {comms}
        {autoPlay && <Divider />}
        {autoPlay && <AutoPlayCell on={autoPlay.on} onToggle={autoPlay.onToggle} />}
        {hasSort && <Divider />}
        {sort}
        {hasHelp && <Divider />}
        {help}
        {hasTakeSeat && <Divider />}
        {takeSeat}
      </span>
    </div>
  );
}
