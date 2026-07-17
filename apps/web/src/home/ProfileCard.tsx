import { useState } from 'react';
import { AvatarChip, Collapsible, Cta, PlayerCard } from '@jaffre/ui';

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
}

/**
 * The identity's hero: the paintable PlayerCard plus a "Your colour" swatch
 * row. Colour and painting are separate deliberate acts — the swatches set the
 * card's fill (and brush), and a Paint toggle reveals the canvas tools. Both
 * persist through the parent so they follow the player across devices.
 */
export function ProfileCard({
  name,
  color,
  paint,
  editable = false,
  onColor,
  onPaint,
}: ProfileCardProps) {
  const [painting, setPainting] = useState(false);
  const fill = color ?? undefined;

  // exactOptionalPropertyTypes: only pass optional props when defined.
  const cardProps = {
    name,
    editable: editable && painting,
    ...(color !== null ? { color } : {}),
    ...(paint !== null ? { paint } : {}),
    ...(onPaint !== undefined ? { onPaint } : {}),
  };

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-[0.9em]">
      <PlayerCard {...cardProps} />

      {editable && (
        <Collapsible
          summary={
            <>
              <AvatarChip name={name} color={fill} size="sm" />
              Customize
            </>
          }
        >
          {!painting ? (
            <>
              <div
                role="group"
                aria-label="Your colour"
                className="flex flex-wrap justify-center gap-[0.5em]"
              >
                {PALETTE.map((c) => {
                  const selected = color?.toLowerCase() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
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
                Paint your card
              </Cta>
            </>
          ) : (
            <Cta type="button" variant="secondary" onClick={() => setPainting(false)}>
              Done painting
            </Cta>
          )}
        </Collapsible>
      )}
    </div>
  );
}
