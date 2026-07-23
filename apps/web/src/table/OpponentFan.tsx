import { PlayingCard } from '@jaffre/ui';

/**
 * An opponent's hidden hand, drawn as a tight face-down fan by their seat chip.
 * Purely decorative (the count is game state the viewer already has), but it
 * does two real jobs: the table reads "who still holds cards" at a glance, and
 * card-skin BACKS — invisible in play before this — are on show all game.
 * Renders under the viewer's own skin (cosmetics are per-viewer, like the felt).
 */
export function OpponentFan({ count }: { readonly count: number }) {
  const n = Math.min(count, 8);
  if (n <= 0) return null;
  const mid = (n - 1) / 2;
  return (
    <div
      aria-hidden
      data-testid="opponent-fan"
      className="pointer-events-none flex justify-center max-sm:scale-[0.72]"
    >
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : '-1.55rem',
            // A shallow arc: edges dip a touch, like cards held in a fist.
            transform: `translateY(${String(Math.abs(i - mid) * 1.5)}px)`,
          }}
        >
          <PlayingCard card={{ suit: 'red', value: 0 }} size="sm" faceDown tilt={(i - mid) * 5} />
        </div>
      ))}
    </div>
  );
}
