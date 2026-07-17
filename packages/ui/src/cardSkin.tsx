import { createContext, useContext, type ReactNode } from 'react';
import type { CardData, SuitId } from './types.js';

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

/**
 * Renderer implementations keyed by skin id (kept in the kit because they
 * compose kit-only primitives — SuitShape, Bonhomme, and skin-specific marks).
 * A skin with no entry here is a pure token recolour. Phase 2 fills this in.
 */
export const CARD_SKIN_RENDERERS: Record<string, CardSkinRenderers> = {};
