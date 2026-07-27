/**
 * The Paint Studio (#paint): a full-screen pixel-art editor for your avatar.
 * What you paint here IS what shows at your seat, on your own 0-cards, and on
 * your hero card — the studio serializes the grid to a `data:image/svg+xml`
 * string and saves it through the unchanged profile pipeline. Transparent cells
 * let your card colour show through, so colour + paint compose into one look.
 */
import { useMemo, useState } from 'react';
import { Cta, Panel, useLang, type Lang } from '@jaffre/ui';
import { getProfile, saveProfile } from '../net/auth.js';
import { emptyGrid } from '../paint/model.js';
import { gridToDataUrl, parsePaint } from '../paint/svg.js';
import { importImageToGrid } from '../paint/importImage.js';
import { IDENTITY_PALETTE } from '../paint/palette.js';
import { usePixelEditor } from '../paint/usePixelEditor.js';
import { PixelGrid } from '../paint/PixelGrid.js';
import { PaintToolbar } from '../paint/PaintToolbar.js';
import { PalettePicker } from '../paint/PalettePicker.js';
import { PreviewStrip } from '../paint/PreviewStrip.js';
import { TemplateRow } from '../paint/TemplateRow.js';

const DEFAULT_COLOR = '#7a6ff0';

const T: Record<
  Lang,
  {
    title: string;
    surface: string;
    save: string;
    remove: string;
    back: string;
    discardQ: string;
    discard: string;
    keep: string;
    removeQ: string;
    removeYes: string;
    legacyQ: string;
    import: string;
    fresh: string;
    background: string;
    bg: (hex: string) => string;
  }
> = {
  en: {
    title: 'Paint Studio',
    surface: 'Your avatar',
    save: 'Save',
    remove: 'Remove',
    back: 'Back',
    discardQ: 'Discard your changes?',
    discard: 'Discard',
    keep: 'Keep editing',
    removeQ: 'Remove your painting?',
    removeYes: 'Remove it',
    legacyQ: 'You have an older painting. Bring it in as pixels, or start fresh?',
    import: 'Import it',
    fresh: 'Start fresh',
    background: 'Card colour',
    bg: (hex) => `Card colour ${hex}`,
  },
  fr: {
    title: 'Atelier pixel',
    surface: 'Ton avatar',
    save: 'Sauvegarder',
    remove: 'Retirer',
    back: 'Retour',
    discardQ: 'Abandonner tes changements?',
    discard: 'Abandonner',
    keep: 'Continuer',
    removeQ: 'Retirer ta peinture?',
    removeYes: 'Retire-la',
    legacyQ: 'Tu as un ancien dessin. On le convertit en pixels, ou on repart à neuf?',
    import: 'Le convertir',
    fresh: 'Repartir à neuf',
    background: 'Couleur de carte',
    bg: (hex) => `Couleur de carte ${hex}`,
  },
};

export interface PaintStudioProps {
  readonly onLeave: () => void;
}

export function PaintStudio({ onLeave }: PaintStudioProps) {
  const t = T[useLang()];
  // Snapshot the profile once — the studio owns editing from here.
  const [profile] = useState(() => getProfile());
  const parsed = useMemo(() => parsePaint(profile.paint), [profile.paint]);
  const [baseColor, setBaseColor] = useState(profile.color ?? DEFAULT_COLOR);

  const [state, dispatch] = usePixelEditor(parsed ?? emptyGrid(), profile.color ?? DEFAULT_COLOR);

  // A non-null paint we couldn't parse is a legacy PNG — offer to pixelate it.
  const legacyPaint = parsed === null && profile.paint !== null ? profile.paint : null;
  const [showLegacy, setShowLegacy] = useState(legacyPaint !== null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Remove deletes the SAVED painting (not just this session's edits) — it
  // gets the same inline confirm the dirty back-guard uses.
  const [confirmRemove, setConfirmRemove] = useState(false);

  const chooseBg = (hex: string) => {
    setBaseColor(hex);
    void saveProfile({ color: hex });
  };

  const save = () => {
    void saveProfile({ paint: gridToDataUrl(state.grid) });
    onLeave();
  };
  const remove = () => {
    void saveProfile({ paint: null });
    onLeave();
  };
  const back = () => {
    if (state.dirty) setConfirmLeave(true);
    else onLeave();
  };

  const importLegacy = async () => {
    setShowLegacy(false);
    if (legacyPaint === null) return;
    const grid = await importImageToGrid(legacyPaint);
    if (grid !== null) dispatch({ t: 'load', grid });
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-(--color-ap-ground) font-arcade-ui text-(--color-ap-text)">
      {/* Header: title + primary actions. Wraps on narrow screens. */}
      <header className="flex flex-wrap items-center justify-between gap-[0.6em] px-[clamp(0.75rem,3vw,1.5rem)] py-[clamp(0.5rem,2vw,1rem)]">
        <h1 className="font-arcade-display text-[clamp(1.4rem,4.5vw,2rem)] uppercase tracking-tight text-(--color-ap-gold)">
          {t.title}
        </h1>
        {confirmLeave ? (
          <div className="flex items-center gap-[0.5em]">
            <span className="text-(length:--text-fluid-sm) text-(--color-ap-muted)">
              {t.discardQ}
            </span>
            <Cta type="button" variant="secondary" onClick={onLeave}>
              {t.discard}
            </Cta>
            <Cta type="button" onClick={() => setConfirmLeave(false)}>
              {t.keep}
            </Cta>
          </div>
        ) : confirmRemove ? (
          <div className="flex items-center gap-[0.5em]">
            <span className="text-(length:--text-fluid-sm) text-(--color-ap-muted)">
              {t.removeQ}
            </span>
            <Cta type="button" variant="secondary" onClick={remove}>
              {t.removeYes}
            </Cta>
            <Cta type="button" onClick={() => setConfirmRemove(false)}>
              {t.keep}
            </Cta>
          </div>
        ) : (
          <div className="flex items-center gap-[0.5em]">
            <Cta type="button" variant="secondary" onClick={() => setConfirmRemove(true)}>
              {t.remove}
            </Cta>
            <Cta type="button" variant="secondary" onClick={back}>
              {t.back}
            </Cta>
            <Cta type="button" onClick={save} data-testid="paint-save">
              {t.save}
            </Cta>
          </div>
        )}
      </header>

      {legacyPaint !== null && showLegacy && (
        <div className="mx-[clamp(0.75rem,3vw,1.5rem)] mb-[0.6em] flex flex-wrap items-center justify-between gap-[0.6em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[1em] py-[0.7em] shadow-(--shadow-ap-sm)">
          <span className="text-(length:--text-fluid-sm)">{t.legacyQ}</span>
          <span className="flex items-center gap-[0.5em]">
            <Cta type="button" variant="secondary" onClick={() => setShowLegacy(false)}>
              {t.fresh}
            </Cta>
            <Cta type="button" onClick={() => void importLegacy()}>
              {t.import}
            </Cta>
          </span>
        </div>
      )}

      {/* Body: grid + controls. Column on phones, row from lg. */}
      <div className="flex min-h-0 flex-1 flex-col gap-[clamp(0.6rem,2vw,1.25rem)] px-[clamp(0.75rem,3vw,1.5rem)] pb-[clamp(0.75rem,2vw,1.5rem)] lg:flex-row lg:items-stretch">
        {/* Grid — square, capped by both width and height so nothing scrolls. */}
        <div className="flex shrink-0 items-center justify-center lg:min-w-0 lg:flex-1">
          {/* The lg height cap also minds the width budget: at the 1024 rail a
              78vh square + the fixed 22rem controls column overflowed the
              viewport and clipped the toolbar's last button. */}
          <div className="aspect-square w-[min(92vw,46vh)] shrink-0 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) p-[0.3em] shadow-(--shadow-ap-lg) lg:h-[min(78vh,40rem,calc(100vw-27rem))] lg:w-auto">
            <PixelGrid state={state} dispatch={dispatch} label={t.surface} />
          </div>
        </div>

        {/* Controls — scroll within their own column if the viewport is short. */}
        <div className="flex min-h-0 flex-col gap-[clamp(0.6rem,1.6vw,1rem)] overflow-y-auto lg:w-[22rem] lg:shrink-0">
          <Panel className="flex flex-col items-center gap-[0.8em] p-[clamp(0.6rem,2vw,1rem)]">
            <PaintToolbar state={state} dispatch={dispatch} />
            <PalettePicker state={state} dispatch={dispatch} />
          </Panel>

          <Panel className="flex flex-col items-center gap-[0.7em] p-[clamp(0.6rem,2vw,1rem)]">
            {/* Background colour lives here too, so the whole look is one screen. */}
            <span className="font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
              {t.background}
            </span>
            <div className="flex flex-wrap justify-center gap-[0.4em]">
              {IDENTITY_PALETTE.map((c) => {
                const selected = baseColor.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={t.bg(c)}
                    aria-pressed={selected}
                    onClick={() => chooseBg(c)}
                    style={{ background: c }}
                    className={`size-[1.6em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) transition ${
                      selected
                        ? 'ring-[3px] ring-(--color-ap-text)'
                        : 'shadow-(--shadow-ap-sm) hover:brightness-110'
                    }`}
                  />
                );
              })}
            </div>
            <PreviewStrip state={state} baseColor={baseColor} />
          </Panel>

          <Panel className="p-[clamp(0.6rem,2vw,1rem)]">
            <TemplateRow dispatch={dispatch} />
          </Panel>
        </div>
      </div>
    </main>
  );
}
