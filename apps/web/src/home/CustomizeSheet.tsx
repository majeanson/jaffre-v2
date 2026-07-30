import { useRef, type ReactNode } from 'react';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { createPortal } from 'react-dom';
import { IDENTITY_PALETTE } from '../paint/palette.js';
import { useScrollLock } from '../components/useScrollLock.js';
import { useDismissLayer } from '../keys/layers.js';
import { NameField } from './NameField.js';

const T: Record<
  Lang,
  {
    customize: string;
    close: string;
    yourColour: string;
    colour: (hex: string) => string;
    paint: string;
  }
> = {
  en: {
    customize: 'Customize',
    close: 'Close customize',
    yourColour: 'Your colour',
    colour: (hex) => `Colour ${hex}`,
    paint: 'Paint your card',
  },
  fr: {
    customize: 'Personnaliser',
    close: 'Fermer la personnalisation',
    yourColour: 'Ta couleur',
    colour: (hex) => `Couleur ${hex}`,
    paint: 'Peins ta carte',
  },
};

/** The identity palette — the shared studio hexes, so a chosen colour and a
 * painted pixel read as one set. */
const PALETTE = IDENTITY_PALETTE;

const noop = () => undefined;

export interface CustomizeSheetProps {
  readonly name: string;
  readonly color: string | null;
  /** Live screen: offer the colour swatches + paint entry. Scenes: static. */
  readonly editable?: boolean;
  /** A palette colour was chosen — persist it. */
  readonly onColor?: (hex: string) => void;
  /** Open the Paint Studio (live screen only). */
  readonly onPaint?: () => void;
  /** Name edited (on the card or in the field) — fires on each keystroke. */
  readonly onName?: (name: string) => void;
  /** Persist the (trimmed) name — called on blur. */
  readonly onNameCommit?: () => void;
  /** Error to surface under the name field (e.g. a taken name). */
  readonly nameError?: string | null;
  /** Extra content at the foot of the sheet — the recovery card (scenes only). */
  readonly children?: ReactNode;
  readonly onClose: () => void;
}

/**
 * The Customize sheet: name, colour palette, and the paint entry — the same
 * overlay idiom as LoginSheet/HelpSheet (portaled to <body>, backdrop click +
 * Escape + a header close button all dismiss it, focus lands on close). The
 * scene viewer stages it open (identityStage !== undefined) so its probes
 * still find the name field and, for the identity scenes, the recovery
 * plates passed in as children.
 */
export function CustomizeSheet({
  name,
  color,
  editable = false,
  onColor,
  onPaint,
  onName,
  onNameCommit,
  nameError = null,
  children,
  onClose,
}: CustomizeSheetProps) {
  const t = T[useLang()];
  useScrollLock();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Focus still lands on the ✕ rather than the first control, so the way out
  // is the first thing announced; Escape, the Tab trap and the return trip to
  // the trigger now come from the app-wide stack.
  useDismissLayer(panel, onClose, { trap: true, initialFocus: () => closeRef.current });

  // Portaled to <body>: the home screen's animated chrome bar is a stacking
  // context, so an inline fixed overlay would slip under the hero fan.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t.customize}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-sm sm:max-w-md flex-col gap-4 overflow-y-auto overscroll-contain rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg)"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-arcade-display text-[1.5em] uppercase tracking-wide text-(--color-ap-gold)">
            {t.customize}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            ✕
          </button>
        </div>

        <NameField
          value={name}
          onChange={onName ?? noop}
          onCommit={onNameCommit ?? noop}
          error={nameError}
        />

        {editable && (
          <>
            <div
              role="group"
              aria-label={t.yourColour}
              className="flex flex-wrap justify-center gap-[0.5em]"
            >
              {PALETTE.map((c) => {
                const selected = color?.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={t.colour(c)}
                    aria-pressed={selected}
                    onClick={() => onColor?.(c)}
                    style={{ background: c }}
                    className={`size-10 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) transition ${
                      selected
                        ? 'ring-[3px] ring-(--color-ap-text)'
                        : 'shadow-(--shadow-ap-sm) hover:brightness-105'
                    }`}
                  />
                );
              })}
            </div>
            <Cta type="button" variant="secondary" className="w-full" onClick={() => onPaint?.()}>
              {t.paint}
            </Cta>
          </>
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}
