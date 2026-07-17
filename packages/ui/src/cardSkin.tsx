import { createContext, useContext, type ReactNode } from 'react';
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
  /** Replaces the centred mark (suit shape / special-card figure / OG art). */
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
 * The original hand-printed Jaffré art (photographed from the old deck): every
 * colour has an ornate EMBLEM tile and a portrait BONHOMME, inked on cream
 * paper. Files: `apps/web/public/og-cards/<suit>_<emblem|bon>.jpg` — the suit
 * id IS the colour name (red/brown/green/blue). The 0-card of each suit shows
 * its bonhomme; 1–7 show the emblem. `mix-blend-mode: darken` melts the photo's
 * cream paper into the card's own (slightly darker) cream face, so only the
 * printed ink shows — the art reads as part of ONE card, not a pasted-on photo.
 * The rank numerals + bonus chip are still drawn by PlayingCard, so the card
 * stays legible. (These are the ONLY raster assets in the app.)
 */
function ogArt(card: CardData): ReactNode {
  const bon = card.value === 0;
  return (
    <img
      src={`/og-cards/${card.suit}_${bon ? 'bon' : 'emblem'}.jpg`}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none select-none object-contain"
      style={{ width: bon ? '84%' : '66%', mixBlendMode: 'darken' }}
    />
  );
}

/**
 * Renderer implementations keyed by skin id (kept in the kit because they
 * compose kit-only primitives — SuitShape, Bonhomme, OG art, and skin marks).
 * A skin with no entry here is a pure token recolour (arcade, noir).
 */
export const CARD_SKIN_RENDERERS: Record<string, CardSkinRenderers> = {
  // Classic OG: a taste of the old deck — every 0-card shows its REAL portrait
  // bonhomme; the 1–7 keep the arcade suit shape. A free hint of the full deck.
  'classic-og': {
    centerMark: (card, size) =>
      card.value === 0 ? ogArt(card) : <SuitShape suit={card.suit} size={size} />,
  },
  // OG Deck: the complete original deck — 0 = the bonhomme portrait, 1–7 = the
  // ornate emblem tile, with our own corner numerals. Cream card, printed ink.
  'og-deck': {
    centerMark: (card) => ogArt(card),
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
