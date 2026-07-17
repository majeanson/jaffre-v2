export interface CoachHintProps {
  readonly tip: string;
}

/**
 * The Coach's one-line advice, shown over the stage on your turn. Deliberately
 * quiet — a suggestion, not an instruction — with the recommended card lit up
 * in your hand to match.
 */
export function CoachHint({ tip }: CoachHintProps) {
  return (
    <div className="pointer-events-none absolute bottom-[4%] left-1/2 z-20 -translate-x-1/2 px-3">
      {/* Coaching whisper — an ink pill with a gold spark; permanently dark, so
          its text is white (not the flipping --color-ap-text). */}
      <div className="pop-in flex max-w-[min(92vw,34rem)] items-center gap-2.5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2.5 shadow-(--shadow-ap)">
        <span aria-hidden className="text-(--color-ap-gold)">
          ❖
        </span>
        <span className="font-arcade-ui text-(length:--text-fluid-sm) leading-snug text-white/90">
          {tip}
        </span>
      </div>
    </div>
  );
}
