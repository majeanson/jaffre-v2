import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import type { CardData, SuitId } from './types.js';
import { SUIT_STYLES } from './types.js';
import { SuitShape } from './components/SuitShape.js';
import { Bonhomme } from './components/Bonhomme.js';

/**
 * Card-skin render layer — parallel to i18n's LangProvider. A card skin can be
 * a pure token recolour (via a `[data-card-skin]` block in tokens.css, no code
 * here) and/or supply optional renderers that change the actual MARKS/art. The
 * app decides the active skin and provides it once at the root, ABOVE every
 * animated card, so a swap re-renders PlayingCard in place (never remounts).
 * Absent slots fall back to PlayingCard's default SuitShape/Bonhomme.
 */
export interface CardSkinRenderers {
  /** Replaces the centred mark (suit shape / special-card figure). */
  readonly centerMark?: (card: CardData, size: string) => ReactNode;
  /** Replaces a standalone suit mark (legend / trump indicator). */
  readonly suitMark?: (suit: SuitId, size: string) => ReactNode;
}

export interface CardSkinValue {
  readonly id: string;
  readonly renderers: CardSkinRenderers;
}

const DEFAULT: CardSkinValue = { id: 'arcade', renderers: {} };

const CardSkinContext = createContext<CardSkinValue>(DEFAULT);

export function CardSkinProvider({
  value,
  children,
}: {
  value: CardSkinValue;
  children: ReactNode;
}) {
  return <CardSkinContext.Provider value={value}>{children}</CardSkinContext.Provider>;
}

export function useCardSkin(): CardSkinValue {
  return useContext(CardSkinContext);
}

/** The default centred mark — the two 0-cards keep their OG bonhomme, everyone
 * else gets the geometric suit shape. Skin renderers below reuse this so the
 * specials always survive a skin swap. `size` is the SuitShape size; the
 * bonhomme is drawn ~1.45× larger to match PlayingCard's default proportions. */
function defaultCenter(card: CardData, size: string): ReactNode {
  const big = `calc(${size} * 1.45)`;
  if (card.suit === 'red' && card.value === 0) return <Bonhomme kind="joffre" size={big} />;
  if (card.suit === 'brown' && card.value === 0) return <Bonhomme kind="allemagne" size={big} />;
  return <SuitShape suit={card.suit} size={size} />;
}

/**
 * Renderer implementations keyed by skin id (kept in the kit because they
 * compose kit-only primitives — SuitShape, Bonhomme, and skin-specific marks).
 * A skin with no entry here is a pure token recolour (arcade, noir); these three
 * add an art flourish ON TOP of their token block. Every renderer keeps the two
 * specials as bonhommes via `defaultCenter`.
 */
export const CARD_SKIN_RENDERERS: Record<string, CardSkinRenderers> = {
  // Classic OG deck: the suit mark framed in a thin inked double-ring, like an
  // old printed pip. Specials keep their bonhomme (unframed).
  'classic-og': {
    centerMark: (card, size) => {
      if (card.value === 0 && (card.suit === 'red' || card.suit === 'brown')) {
        return defaultCenter(card, size);
      }
      const ring: CSSProperties = {
        width: `calc(${size} * 1.75)`,
        height: `calc(${size} * 1.75)`,
        border: '0.09em solid var(--color-ap-ink)',
        borderRadius: '999px',
        boxShadow: 'inset 0 0 0 0.055em var(--color-card-back)',
      };
      return (
        <span className="grid place-items-center" style={ring}>
          <SuitShape suit={card.suit} size={size} />
        </span>
      );
    },
  },
  // Lamplight foil: a slow diagonal sheen sweeps across the mark (decorative,
  // auto-disabled under reduced motion by the .ap-foil rule).
  'lamplight-foil': {
    centerMark: (card, size) => (
      <span
        className="ap-foil grid place-items-center"
        style={{ padding: '0.16em', borderRadius: '999px' }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
  },
  // Neon: the mark glows in its own suit colour.
  neon: {
    centerMark: (card, size) => (
      <span
        className="grid place-items-center"
        style={{ filter: `drop-shadow(0 0 0.3em ${SUIT_STYLES[card.suit].color})` }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
  },
};
