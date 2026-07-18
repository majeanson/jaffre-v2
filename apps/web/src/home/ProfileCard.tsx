import { useEffect, useState, type ReactNode } from 'react';
import { AvatarChip, Collapsible, Cta, PlayerCard, useLang, type Lang } from '@jaffre/ui';
import { NameField } from './NameField.js';

const T: Record<
  Lang,
  {
    customize: string;
    yourColour: string;
    colour: (hex: string) => string;
    paint: string;
    donePainting: string;
  }
> = {
  en: {
    customize: 'Customize',
    yourColour: 'Your colour',
    colour: (hex) => `Colour ${hex}`,
    paint: 'Paint your card',
    donePainting: 'Done painting',
  },
  fr: {
    customize: 'Personnaliser',
    yourColour: 'Ta couleur',
    colour: (hex) => `Couleur ${hex}`,
    paint: 'Peins ta carte',
    donePainting: 'Fini de peindre',
  },
};

/** The identity palette — same hexes the PlayerCard brush offers, so a chosen
 * colour and a painted stroke read as one set. Suit/accent colours from the
 * shared kit. */
const PALETTE = [
  '#7a6ff0',
  '#f2b712',
  '#e05252',
  '#58b884',
  '#82c7dc',
  '#f2c66d',
  '#b07a2e',
  '#ebe6f5',
] as const;

const noop = () => undefined;

export interface ProfileCardProps {
  readonly name: string;
  readonly color: string | null;
  readonly paint: string | null;
  /** Live screen: offer the colour swatches + paint mode. Scenes: static. */
  readonly editable?: boolean;
  /** A palette colour was chosen — persist it. */
  readonly onColor?: (hex: string) => void;
  /** The card was painted (data URL) — persist it. */
  readonly onPaint?: (dataUrl: string) => void;
  /** Name edited (on the card or in the field) — fires on each keystroke. */
  readonly onName?: (name: string) => void;
  /** Persist the (trimmed) name — called on blur. */
  readonly onNameCommit?: () => void;
  /** Error to surface under the name field (e.g. a taken name). */
  readonly nameError?: string | null;
  /** Extra content at the foot of the Customize disclosure — the recovery card. */
  readonly children?: ReactNode;
  /** Open the disclosure on mount (scene viewer stages it open). */
  readonly defaultOpen?: boolean;
  /** Bump to jump straight into paint mode (tap-your-card on the hero fan). */
  readonly paintSignal?: number;
}

/**
 * The identity row: by default a SMALL PlayerCard sits beside the "Customize"
 * disclosure (the JAFFRE wordmark above stays the highlight). Opening Customize
 * grows the card to full size for painting/renaming, with everything secondary
 * — name field, colour swatches, paint mode, recovery code — inside the
 * disclosure. Colour and painting are separate deliberate acts; both persist
 * through the parent so they follow the player across devices.
 */
export function ProfileCard({
  name,
  color,
  paint,
  editable = false,
  onColor,
  onPaint,
  onName,
  onNameCommit,
  nameError = null,
  children,
  defaultOpen = false,
  paintSignal = 0,
}: ProfileCardProps) {
  const t = T[useLang()];
  const [painting, setPainting] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const fill = color ?? undefined;

  // Tap-your-card on the hero fan: land here with the brush already out.
  useEffect(() => {
    if (paintSignal > 0) {
      setOpen(true);
      setPainting(true);
    }
  }, [paintSignal]);

  // exactOptionalPropertyTypes: only pass optional props when defined.
  const cardProps = {
    name,
    editable: editable && painting,
    ...(color !== null ? { color } : {}),
    ...(paint !== null ? { paint } : {}),
    ...(onPaint !== undefined ? { onPaint } : {}),
    // Inline rename lives on the card on the live screen (not the inert scenes).
    ...(editable && onName !== undefined ? { onName, onNameCommit: onNameCommit ?? noop } : {}),
  };

  return (
    // Closed: A|B row — small card beside the Customize trigger, so the brand
    // moment above owns the screen. Open: the card grows to full size (column).
    <div
      className={
        open
          ? 'flex w-full max-w-xs flex-col items-center gap-[0.9em]'
          : 'flex w-full max-w-xs items-center justify-center gap-4'
      }
    >
      <div className={open ? '' : 'text-[0.55em]'}>
        <PlayerCard {...cardProps} />
      </div>

      <Collapsible
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Closing mid-paint would leave a tiny editable card — end the mode.
          if (!next) setPainting(false);
        }}
        className={open ? 'w-full' : 'w-auto'}
        summary={
          <>
            <AvatarChip name={name} color={fill} size="sm" />
            {t.customize}
          </>
        }
      >
        <NameField
          value={name}
          onChange={onName ?? noop}
          onCommit={onNameCommit ?? noop}
          error={nameError}
        />

        {editable && !painting && (
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
            <Cta type="button" variant="secondary" onClick={() => setPainting(true)}>
              {t.paint}
            </Cta>
          </>
        )}
        {editable && painting && (
          <Cta type="button" variant="secondary" onClick={() => setPainting(false)}>
            {t.donePainting}
          </Cta>
        )}

        {children}
      </Collapsible>
    </div>
  );
}
