import { useEffect } from 'react';

export interface ToastProps {
  readonly message: string;
  /** Called once the toast has shown for `durationMs` — the owner clears it. */
  readonly onDone: () => void;
  readonly durationMs?: number;
}

/** A small transient status bubble — e.g. "Link copied" after a clipboard share. */
export function Toast({ message, onDone, durationMs = 2000 }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [onDone, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto w-fit rounded-lg bg-(--color-felt-950)/95 px-4 py-2.5 text-sm font-medium text-(--color-ivory) shadow-(--shadow-panel)"
    >
      {message}
    </div>
  );
}
