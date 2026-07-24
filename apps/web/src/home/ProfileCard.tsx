import { useState, type ReactNode } from 'react';
import { AvatarChip, Collapsible, Cta, PlayerCard, useLang, type Lang } from '@jaffre/ui';
import { IDENTITY_PALETTE } from '../paint/palette.js';
import { NameField } from './NameField.js';

const T: Record<
  Lang,
  {
    customize: string;
    yourColour: string;
    colour: (hex: string) => string;
    paint: string;
  }
> = {
  en: {
    customize: 'Customize',
    yourColour: 'Your colour',
    colour: (hex) => `Colour ${hex}`,
    paint: 'Paint your card',
  },
  fr: {
    customize: 'Personnaliser',
    yourColour: 'Ta couleur',
    colour: (hex) => `Couleur ${hex}`,
    paint: 'Peins ta carte',
  },
};

/** The identity palette — the shared studio hexes, so a chosen colour and a
 * painted pixel read as one set. */
const PALETTE = IDENTITY_PALETTE;

const noop = () => undefined;

export interface ProfileCardProps {
  readonly name: string;
  readonly color: string | null;
  readonly paint: string | null;
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
  /** Extra content at the foot of the Customize disclosure — the recovery card. */
  readonly children?: ReactNode;
  /** Open the disclosure on mount (scene viewer stages it open). */
  readonly defaultOpen?: boolean;
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
}: ProfileCardProps) {
  const t = T[useLang()];
  const [open, setOpen] = useState(defaultOpen);
  const fill = color ?? undefined;

  // exactOptionalPropertyTypes: only pass optional props when defined.
  const cardProps = {
    name,
    ...(color !== null ? { color } : {}),
    ...(paint !== null ? { paint } : {}),
    // Inline rename lives on the card on the live screen (not the inert scenes).
    ...(editable && onName !== undefined ? { onName, onNameCommit: onNameCommit ?? noop } : {}),
  };

  return (
    // Always a centered column: your card over the Customize trigger. Closed,
    // the card stays small (the hero fan above already shows it big) so the
    // brand moment owns the screen; opening reveals colour + the paint entry.
    // Full column width so the Customize trigger lines up edge-to-edge with
    // the Level bar and the PLAY / "Ton coin" doors — every home button one
    // width.
    <div className="flex w-full flex-col items-center gap-[0.8em]">
      <div className={open ? '' : 'text-[0.5em]'}>
        <PlayerCard {...cardProps} />
      </div>

      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="w-full"
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
            <Cta type="button" variant="secondary" onClick={() => onPaint?.()}>
              {t.paint}
            </Cta>
          </>
        )}

        {children}
      </Collapsible>
    </div>
  );
}
