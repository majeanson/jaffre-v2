import { useEffect, useRef } from 'react';

export interface GameLogPanelProps {
  readonly lines: readonly string[];
  readonly visible: boolean;
}

/**
 * Owns the game log: the sr-only announcer (ALWAYS mounted, even with the
 * visible log collapsed) + the floating visible history panel.
 */
export function GameLogPanel({ lines, visible }: GameLogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length, visible]);
  const latest = lines[lines.length - 1] ?? '';
  return (
    <>
      {/* The announcer always runs, even with the visible log collapsed. */}
      <div aria-live="polite" className="sr-only">
        {latest}
      </div>
      {visible && (
        <div
          ref={ref}
          data-testid="game-log"
          role="region"
          aria-label="Game log"
          tabIndex={0}
          className="fixed bottom-[24vmin] left-1/2 z-40 h-32 w-[min(92vw,50rem)] -translate-x-1/2 overflow-y-auto rounded-(--radius-panel) border border-white/10 bg-(--color-felt-950)/95 px-4 py-2 text-xs leading-5 text-(--color-ivory)/75 shadow-(--shadow-panel)"
        >
          {lines.slice(-40).map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      )}
    </>
  );
}
