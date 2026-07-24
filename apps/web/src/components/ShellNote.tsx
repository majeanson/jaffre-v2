import type { ReactNode } from 'react';

/**
 * The shared loading/empty/error note card for meta screens (Corner, Awards,
 * Stats, Leaderboard) — one ink-bordered panel, one padding (1.4em).
 * PublicLobby keeps its own local copy (owned by another workstream).
 */
export function ShellNote({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.4em] text-center font-arcade-ui text-(--color-ap-muted) shadow-(--shadow-ap) ${className}`}
    >
      {children}
    </div>
  );
}
