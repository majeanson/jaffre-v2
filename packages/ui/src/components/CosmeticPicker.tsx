import type { ReactNode } from 'react';
import { useLang, type Lang } from '../i18n.js';

/**
 * The Collection gallery's tile grid — one presentational component reused for
 * BOTH cosmetic axes (card skins, themes). It knows nothing about stats or
 * unlock rules: the screen computes owned/locked + the requirement copy and
 * hands each tile a ready-made preview node. A locked tile is dimmed, wears a
 * lock glyph + its requirement + a progress bar, and can't be selected.
 */
export interface CosmeticTile {
  readonly id: string;
  readonly label: string;
  /** A live preview node (a mini deck / felt swatch), rendered token-accurate. */
  readonly preview: ReactNode;
  readonly locked: boolean;
  readonly selected: boolean;
  /** Progress toward the unlock, shown on locked tiles. */
  readonly requirement?: { readonly text: string; readonly have: number; readonly need: number };
}

const T: Record<
  Lang,
  { locked: string; selected: string; progress: (h: number, n: number) => string }
> = {
  en: {
    locked: 'Locked',
    selected: 'Equipped',
    progress: (h, n) => `${String(Math.min(h, n))} / ${String(n)}`,
  },
  fr: {
    locked: 'Verrouillé',
    selected: 'Équipé',
    progress: (h, n) => `${String(Math.min(h, n))} / ${String(n)}`,
  },
};

export interface CosmeticPickerProps {
  readonly tiles: readonly CosmeticTile[];
  readonly onSelect: (id: string) => void;
  /** Accessible group name (e.g. "Card skins"). */
  readonly label: string;
}

export function CosmeticPicker({ tiles, onSelect, label }: CosmeticPickerProps) {
  const t = T[useLang()];
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
    >
      {tiles.map((tile) => {
        const pct =
          tile.requirement === undefined
            ? 0
            : Math.max(0, Math.min(100, (tile.requirement.have / tile.requirement.need) * 100));
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={tile.selected}
            aria-disabled={tile.locked}
            data-testid={`cosmetic-tile-${tile.id}`}
            onClick={() => !tile.locked && onSelect(tile.id)}
            className={`flex cursor-pointer flex-col gap-[0.55em] rounded-(--radius-ap-panel) border-2 p-[0.7em] text-left shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) ${
              tile.selected
                ? 'border-(--color-ap-violet) bg-(--color-ap-panel-hover) ring-2 ring-(--color-ap-violet)'
                : 'border-(--color-ap-ink) bg-(--color-ap-panel) hover:bg-(--color-ap-panel-hover)'
            } ${tile.locked ? 'cursor-not-allowed' : 'enabled:active:translate-x-[2px] enabled:active:translate-y-[2px] enabled:active:shadow-none'}`}
          >
            {/* Preview — dimmed + lock glyph when not owned. */}
            <div className="relative grid place-items-center overflow-hidden rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-[0.6em]">
              <div className={tile.locked ? 'opacity-35 saturate-[0.6]' : ''}>{tile.preview}</div>
              {tile.locked && (
                <span
                  aria-hidden
                  className="absolute right-[0.35em] top-[0.3em] font-arcade-display text-[1.1em] text-(--color-ap-violet-soft)"
                >
                  🔒
                </span>
              )}
              {/* Equipped ribbon lives on the preview corner (like the lock) so
                  the label row below can give the full skin name room to breathe
                  — on a narrow phone tile, name + inline badge used to collide
                  and truncate ("ARCA…"). */}
              {tile.selected && (
                <span className="absolute right-[0.3em] top-[0.3em] rounded-full border-2 border-(--color-ap-violet) bg-(--color-ap-panel) px-[0.5em] py-[0.05em] font-arcade-ui text-[0.55em] font-bold uppercase tracking-[0.1em] text-(--color-ap-violet-soft) shadow-(--shadow-ap-sm)">
                  {t.selected}
                </span>
              )}
            </div>

            {/* Label */}
            <div className="flex items-center gap-2">
              <span className="truncate font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-text)">
                {tile.label}
              </span>
            </div>

            {/* Locked: requirement + progress bar. */}
            {tile.locked && tile.requirement !== undefined && (
              <div className="flex flex-col gap-[0.35em]">
                <span className="font-arcade-ui text-[0.68em] leading-tight text-(--color-ap-muted)">
                  {tile.requirement.text}
                </span>
                <div className="flex items-center gap-[0.4em]">
                  <div className="h-[0.5em] flex-1 overflow-hidden rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ground)">
                    <div
                      className="h-full bg-(--color-ap-violet)"
                      style={{ width: `${String(pct)}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-arcade-ui text-[0.6em] tabular-nums text-(--color-ap-muted)">
                    {t.progress(tile.requirement.have, tile.requirement.need)}
                  </span>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
