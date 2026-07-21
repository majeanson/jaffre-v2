import { useEffect } from 'react';
import { SLOT_STATUS, useBottomSlot } from './bottomSlot.js';

export interface ToastProps {
  readonly message: string;
  /** Called once the toast has shown for `durationMs` — the owner clears it. */
  readonly onDone: () => void;
  readonly durationMs?: number;
}

/** A small transient status bubble — e.g. "Link copied" after a clipboard share. */
export function Toast({ message, onDone, durationMs = 2000 }: ToastProps) {
  const visible = useBottomSlot(SLOT_STATUS, true);
  // Only tick while actually shown — if a higher-priority toast holds the
  // slot, this one waits its turn instead of expiring unseen.
  useEffect(() => {
    if (!visible) return undefined;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [visible, onDone, durationMs]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto w-fit rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-ui text-sm font-medium text-(--color-ap-text) shadow-(--shadow-ap)"
    >
      {message}
    </div>
  );
}
