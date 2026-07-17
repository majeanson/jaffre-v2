import { useState } from 'react';
import { consoleActive, currentScores, jumpTo, redeal, setScores } from '../local/localGame.js';

/** Flip to false (or gate behind a flag) to hide the console in prod. Kept on
 * for now so the game can be driven into any state while testing. */
export const DEV_CONSOLE_ENABLED = true;

const BTN =
  'cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2.5 py-1.5 text-left font-arcade-display text-[0.72em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) enabled:hover:bg-(--color-ap-panel-hover) disabled:opacity-45';

/**
 * A live engine console for driving the running PRACTICE game into any state —
 * jump to round/game over, set the scores on the brink of a win, or re-deal
 * (incl. a red-0 board). No-op online (there's no client-side engine to poke),
 * where it shows a hint instead. Dev-only; gated by DEV_CONSOLE_ENABLED.
 */
export function DevConsole() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);
  const act = (fn: () => void) => () => {
    fn();
    rerender();
  };

  const active = consoleActive();
  const [sun, moon] = currentScores();

  return (
    <div className="fixed bottom-2 left-2 z-[90] flex flex-col items-start gap-2 font-arcade-ui">
      {open && (
        <div className="flex w-52 flex-col gap-1.5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-violet) bg-(--color-ap-ground) p-2.5 shadow-(--shadow-ap-lg)">
          {!active && (
            <p className="px-0.5 text-[0.72em] leading-snug text-(--color-ap-muted)">
              Practice game only — engine pokes are disabled online.
            </p>
          )}
          <button
            type="button"
            className={BTN}
            disabled={!active}
            onClick={act(() => jumpTo('round_over'))}
          >
            ⏭ Skip to round over
          </button>
          <button
            type="button"
            className={BTN}
            disabled={!active}
            onClick={act(() => jumpTo('game_over'))}
          >
            ⏭ Skip to game over
          </button>
          <div className="mt-0.5 flex items-center justify-between px-0.5 text-[0.7em] tabular-nums text-(--color-ap-muted)">
            <span>
              Scores <span style={{ color: 'var(--color-team-a)' }}>{sun}</span>
              <span className="mx-0.5">·</span>
              <span style={{ color: 'var(--color-team-b)' }}>{moon}</span>
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`${BTN} flex-1 text-center`}
              disabled={!active}
              onClick={act(() => setScores([40, moon]))}
            >
              Sun→40
            </button>
            <button
              type="button"
              className={`${BTN} flex-1 text-center`}
              disabled={!active}
              onClick={act(() => setScores([sun, 40]))}
            >
              Moon→40
            </button>
            <button
              type="button"
              className={`${BTN} flex-1 text-center`}
              disabled={!active}
              onClick={act(() => setScores([0, 0]))}
            >
              0-0
            </button>
          </div>
          <button type="button" className={BTN} onClick={act(() => redeal())}>
            ♺ New deal
          </button>
          <button type="button" className={BTN} onClick={act(() => redeal(27))}>
            ♺ New deal (red 0)
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label="Dev console"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-violet) bg-(--color-ap-ink) px-2.5 py-1.5 font-arcade-display text-[0.72em] uppercase tracking-wide text-(--color-ap-violet-soft) shadow-(--shadow-ap-sm)"
      >
        {open ? '▾' : '▸'} Console
      </button>
    </div>
  );
}
