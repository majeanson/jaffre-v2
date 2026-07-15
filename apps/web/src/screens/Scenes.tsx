import { useEffect, useState } from 'react';
import { SCENES } from '../dev/scenes.js';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';
import { Table } from './Table.js';

export interface ScenesProps {
  readonly onLeave: () => void;
}

/**
 * Owns the scene viewer (#scenes): live-through every phase of a game
 * instantly — real Table rendering staged engine states, with a floating
 * picker. Actions are inert; switch skins from the top bar as usual.
 */
const FALLBACK = SCENES[0];

export function Scenes({ onLeave }: ScenesProps) {
  const [index, setIndex] = useState(0);
  const safeIndex = ((index % SCENES.length) + SCENES.length) % SCENES.length;
  const current = SCENES[safeIndex] ?? FALLBACK;

  useEffect(() => {
    current?.load();
  }, [current]);

  if (current === undefined) return null;

  return (
    <>
      <Table onAction={() => undefined} onLeave={onLeave} frozenHold={current.frozenHold} />
      <div className="fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-(--color-accent)/40 bg-black/80 px-3 py-2 shadow-(--shadow-panel)">
        <button
          type="button"
          onClick={() => setIndex((i) => i - 1)}
          className={GHOST_BTN_SM}
          aria-label="Previous scene"
        >
          ←
        </button>
        <select
          aria-label="Scene"
          value={current.id}
          onChange={(e) => setIndex(SCENES.findIndex((s) => s.id === e.target.value))}
          className="cursor-pointer rounded-lg border border-white/15 bg-(--color-felt-800) px-2 py-1.5 text-(length:--text-fluid-xs) text-(--color-ivory)"
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          className={GHOST_BTN_SM}
          aria-label="Next scene"
        >
          →
        </button>
      </div>
    </>
  );
}
