const CONFETTI_COLORS = [
  'var(--color-suit-red)',
  'var(--color-suit-green)',
  'var(--color-suit-blue)',
  'var(--color-lamplight)',
];

/** Owns the celebration: a dozen falling pieces over the winner card. CSS-only; reduced-motion hides the fall. */
export function Confetti() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 block">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute block h-2.5 w-1.5 rounded-xs"
          style={{
            left: `${5 + i * 8}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 5) * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}
