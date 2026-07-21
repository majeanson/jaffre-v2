/**
 * The colour palette: the 24 studio swatches (eight hues × dark/base/light)
 * plus a custom-colour well backed by a native colour input, so any colour is
 * reachable while the curated set stays one tap away. Picking a colour also
 * flips an active eraser back to the pencil (handled in the reducer).
 */
import { useLang, type Lang } from '@jaffre/ui';
import { STUDIO_PALETTE } from './palette.js';
import type { EditorState, EditorAction } from './editor.js';

const T: Record<Lang, { palette: string; colour: (hex: string) => string; custom: string }> = {
  en: {
    palette: 'Colours',
    colour: (hex) => `Colour ${hex}`,
    custom: 'Custom colour',
  },
  fr: {
    palette: 'Couleurs',
    colour: (hex) => `Couleur ${hex}`,
    custom: 'Couleur personnalisée',
  },
};

export interface PalettePickerProps {
  readonly state: EditorState;
  readonly dispatch: React.Dispatch<EditorAction>;
}

export function PalettePicker({ state, dispatch }: PalettePickerProps) {
  const t = T[useLang()];
  const active = state.color.toLowerCase();
  const isPreset = STUDIO_PALETTE.some((c) => c.toLowerCase() === active);

  return (
    <div
      role="group"
      aria-label={t.palette}
      className="grid grid-cols-8 gap-[0.35em] max-sm:gap-[0.3em]"
    >
      {STUDIO_PALETTE.map((c) => {
        const selected = active === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            aria-label={t.colour(c)}
            aria-pressed={selected}
            data-testid={`swatch-${c}`}
            onClick={() => dispatch({ t: 'setColor', color: c })}
            style={{ background: c }}
            className={`aspect-square w-full rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) transition ${
              selected
                ? 'ring-[3px] ring-(--color-ap-text)'
                : 'shadow-(--shadow-ap-sm) hover:brightness-110'
            }`}
          />
        );
      })}

      {/* Custom colour well — the label IS the swatch; the native input sits on
          top, transparent, so a tap opens the OS colour picker. */}
      <label
        aria-label={t.custom}
        title={t.custom}
        className={`relative grid aspect-square w-full cursor-pointer place-items-center overflow-hidden rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm) ${
          isPreset ? '' : 'ring-[3px] ring-(--color-ap-text)'
        }`}
        style={{ background: isPreset ? 'var(--color-ap-panel)' : state.color }}
      >
        {isPreset && (
          <span
            aria-hidden
            className="size-[70%] rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, #e05252, #f2b712, #58b884, #82c7dc, #7a6ff0, #e05252)',
            }}
          />
        )}
        <input
          type="color"
          value={isPreset ? '#7a6ff0' : state.color}
          data-testid="swatch-custom"
          onChange={(e) => dispatch({ t: 'setColor', color: e.target.value })}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
