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
  /**
   * Replaces the face-DOWN card art. When present, PlayingCard drops the default
   * striped card-back and renders this over the card-face colour instead (e.g.
   * the OG emblem printed on paper). Takes no card — every back is identical.
   */
  readonly back?: () => ReactNode;
}

export interface CardSkinValue {
  readonly id: string;
  readonly renderers: CardSkinRenderers;
  /**
   * Which figure art wins on the two scoring 0-card specials — a THIRD axis,
   * independent of the card skin (see Collection's "Bonhommes" section):
   *  - 'pixel'   — the pixel-art Bonhomme sprite, always, on every 0-card.
   *  - 'painted' — the viewer's OWN painting on their OWN 0-specials (today's
   *    behaviour); everyone else's 0s fall through to the skin/default. DEFAULT.
   *  - 'og'      — the photographed OG portrait, always, on every 0-card.
   * Optional so callers that don't care (skin previews scoped to non-zero
   * cards, etc.) can omit it and get the default.
   */
  readonly bonhommes?: 'pixel' | 'painted' | 'og';
}

const DEFAULT: CardSkinValue = { id: 'arcade', renderers: {}, bonhommes: 'painted' };

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
/**
 * Just the 0-card portrait piece of ogArt — exported so callers that want the
 * OG bonhomme specifically (not the full emblem-or-portrait dispatch) can
 * reuse it, e.g. the 'og' bonhomme-skin mode in PlayingCard, which forces
 * this art on every 0-card regardless of the active card skin. Emblems (1–7)
 * and the blue/green bonhommes sit at the same footprint as any other card;
 * only the two scoring specials (red = Joffre +5, brown = −2) get a slightly
 * larger portrait to stand out.
 */
export function ogBonhomme(card: CardData): ReactNode {
  const big = card.suit === 'red' || card.suit === 'brown';
  return (
    <img
      src={`/og-cards/${card.suit}_bon.jpg`}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none select-none object-contain"
      style={{ width: big ? '74%' : '66%', mixBlendMode: 'darken' }}
    />
  );
}

function ogArt(card: CardData): ReactNode {
  if (card.value === 0) return ogBonhomme(card);
  return (
    <img
      src={`/og-cards/${card.suit}_emblem.jpg`}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none select-none object-contain"
      style={{ width: '66%', mixBlendMode: 'darken' }}
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
  // The face-down back prints the red emblem on the same cream paper.
  'og-deck': {
    centerMark: (card) => ogArt(card),
    back: () => (
      <img
        src="/og-cards/red_emblem.jpg"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none select-none object-contain"
        style={{ width: '80%', mixBlendMode: 'darken' }}
      />
    ),
  },
  // Noir: an art-deco double frame on charcoal — quiet, like the deck.
  noir: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          boxShadow:
            'inset 0 0 0 0.18em var(--color-card-back), inset 0 0 0 0.26em var(--color-card-back-line), inset 0 0 0 0.42em var(--color-card-back), inset 0 0 0 0.5em var(--color-card-back-line)',
        }}
      />
    ),
  },
  // Lamplight foil: a slow diagonal sheen sweeps across the mark (decorative,
  // auto-disabled under reduced motion by the .ap-foil rule). The back is the
  // same foil over a warm lamplit gold pool.
  'lamplight-foil': {
    centerMark: (card, size) => (
      <span
        className="ap-foil grid place-items-center"
        style={{ padding: '0.16em', borderRadius: '999px' }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
    back: () => (
      <div
        className="ap-foil size-full"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, var(--color-card-back-line) 0 0.9em, transparent 1.6em), var(--color-card-back)',
        }}
      />
    ),
  },
  // Neon: the mark glows in its own suit colour; the back is a glowing grid on
  // the dark face — the arcade cabinet floor.
  neon: {
    centerMark: (card, size) => (
      <span
        className="grid place-items-center"
        style={{ filter: `drop-shadow(0 0 0.3em ${SUIT_STYLES[card.suit].color})` }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: '#16102c',
          backgroundImage: [
            'radial-gradient(circle at 50% 50%, rgb(255 45 142 / 0.5) 0 0.5em, transparent 1.4em)',
            'repeating-linear-gradient(0deg, rgb(255 45 142 / 0.4) 0 0.06em, transparent 0.06em 0.55em)',
            'repeating-linear-gradient(90deg, rgb(70 180 255 / 0.35) 0 0.06em, transparent 0.06em 0.55em)',
          ].join(', '),
        }}
      />
    ),
  },
  // Woodcut: the back is end-grain — heavy ink bands over parchment-dark wood.
  woodcut: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'repeating-linear-gradient(0deg, var(--color-card-back-line) 0 0.12em, transparent 0.12em 0.55em)',
            'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.18) 0 0.9em, transparent 0.9em 1.8em)',
          ].join(', '),
        }}
      />
    ),
  },
  // Gilded: a gold diamond lattice on black lacquer.
  gilded: {
    centerMark: (card, size) => (
      <span
        className="grid place-items-center"
        style={{ filter: 'drop-shadow(0 0 0.28em rgb(242 183 18 / 0.6))' }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'repeating-linear-gradient(45deg, var(--color-card-back-line) 0 0.07em, transparent 0.07em 0.7em)',
            'repeating-linear-gradient(-45deg, var(--color-card-back-line) 0 0.07em, transparent 0.07em 0.7em)',
          ].join(', '),
        }}
      />
    ),
  },
  // Blood Moon: a red moon rising over a black field — the rival's colours.
  bloodmoon: {
    back: () => (
      <div
        className="size-full"
        style={{
          background: [
            'radial-gradient(circle at 62% 34%, transparent 0 0.62em, var(--color-card-back) 0.62em)',
            'radial-gradient(circle at 50% 40%, var(--color-card-back-line) 0 0.85em, transparent 0.9em)',
            'var(--color-card-back)',
          ].join(', '),
        }}
      />
    ),
  },
  // Sans Atout: all four suits, none of them trump — the no-trump crest.
  'sans-atout': {
    back: () => (
      <div
        className="grid size-full place-items-center"
        style={{ backgroundColor: 'var(--color-card-back)' }}
      >
        <span
          className="grid grid-cols-2 place-items-center gap-[0.28em] rounded-full border-[0.09em] p-[0.3em]"
          style={{ borderColor: 'var(--color-card-back-line)', opacity: 0.85 }}
        >
          <SuitShape suit="red" size="0.55em" />
          <SuitShape suit="brown" size="0.55em" />
          <SuitShape suit="green" size="0.55em" />
          <SuitShape suit="blue" size="0.55em" />
        </span>
      </div>
    ),
  },
  // Newsprint: the back is a halftone-dot press plate over the ink colour.
  newsprint: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage:
            'radial-gradient(var(--color-card-back-line) 0.055em, transparent 0.07em)',
          backgroundSize: '0.38em 0.38em',
        }}
      />
    ),
  },
  // Blueprint: the back is drafting grid paper — fine lines every 0.5em with a
  // heavier line every 2em, chalk on cyanotype blue.
  blueprint: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'repeating-linear-gradient(0deg, rgb(125 184 255 / 0.5) 0 0.06em, transparent 0.06em 2em)',
            'repeating-linear-gradient(90deg, rgb(125 184 255 / 0.5) 0 0.06em, transparent 0.06em 2em)',
            'repeating-linear-gradient(0deg, rgb(125 184 255 / 0.22) 0 0.05em, transparent 0.05em 0.5em)',
            'repeating-linear-gradient(90deg, rgb(125 184 255 / 0.22) 0 0.05em, transparent 0.05em 0.5em)',
          ].join(', '),
        }}
      />
    ),
  },
  // Pixel Parlor: hard 1px-style pixel shadow under every mark (no blur — this
  // is an 8-bit sprite, not a glow) and a dithered checkerboard back.
  'pixel-parlor': {
    centerMark: (card, size) => (
      <span
        className="grid place-items-center"
        style={{ filter: 'drop-shadow(0.07em 0.07em 0 rgb(0 0 0 / 0.45))' }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage:
            'repeating-conic-gradient(var(--color-card-back-line) 0% 25%, transparent 0% 50%)',
          backgroundSize: '0.5em 0.5em',
        }}
      />
    ),
  },
  // Stained Glass: each mark sits in a leaded round pane, backlit by its own
  // suit colour.
  'stained-glass': {
    centerMark: (card, size) => (
      <span
        className="grid place-items-center rounded-full"
        style={{
          padding: '0.2em',
          background: `radial-gradient(closest-side, ${SUIT_STYLES[card.suit].color}33, transparent)`,
          boxShadow: 'inset 0 0 0 0.07em var(--color-ap-ink)',
          filter: `drop-shadow(0 0 0.25em ${SUIT_STYLES[card.suit].color})`,
        }}
      >
        {defaultCenter(card, size)}
      </span>
    ),
    // The back is a leaded rose window — coloured panes around a ring.
    back: () => (
      <div
        className="size-full"
        style={{
          background: [
            'radial-gradient(circle at 50% 50%, transparent 0 0.55em, var(--color-card-back) 0.55em 0.65em, transparent 0.65em 1.1em, var(--color-card-back) 1.1em 1.2em, transparent 1.2em)',
            'conic-gradient(from 22deg, #b8443f, #b58b2a, #3f7a52, #3f5d94, #7a4a8c, #b8443f)',
          ].join(', '),
          opacity: 0.9,
        }}
      />
    ),
  },
  // Vaporwave: the back is a neon sunset — banded sun over a horizon grid.
  vaporwave: {
    back: () => (
      <div
        className="size-full"
        style={{
          background: [
            'radial-gradient(circle at 50% 40%, #ffb46e 0 0.85em, #ff7ac8 0.85em 1.3em, transparent 1.35em)',
            'repeating-linear-gradient(0deg, rgb(255 122 200 / 0.3) 0 0.1em, transparent 0.1em 0.5em)',
            'linear-gradient(180deg, #1a1040, #452a7a)',
          ].join(', '),
        }}
      />
    ),
  },
  // Prismatic: a slowly hue-cycling holo halo BEHIND the mark (the mark itself
  // keeps its true suit colour — the shape+colour identity never shifts), and
  // an iridescent foil back that cycles the same way. Both freeze under
  // reduced motion via .skin-prism.
  prismatic: {
    centerMark: (card, size) => (
      <span className="relative grid place-items-center">
        <span
          aria-hidden
          className="skin-prism absolute inset-[-0.3em] rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, #ff9ecf, #ffd47d, #9dffc9, #8fc2ff, #d29bff, #ff9ecf)',
            opacity: 0.4,
            maskImage: 'radial-gradient(closest-side, black 55%, transparent)',
            WebkitMaskImage: 'radial-gradient(closest-side, black 55%, transparent)',
          }}
        />
        <span className="relative">{defaultCenter(card, size)}</span>
      </span>
    ),
    back: () => (
      <div
        className="skin-prism size-full"
        style={{
          background:
            'linear-gradient(135deg, #ff9ecf 0%, #ffd47d 25%, #9dffc9 50%, #8fc2ff 75%, #d29bff 100%)',
        }}
      />
    ),
  },
  // ── Level-track exclusives (Journey levels 15/17/20) ──────────────────────
  // Circuit: copper traces + solder pads on a dark PCB.
  circuit: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'radial-gradient(var(--color-card-back-line) 0.07em, transparent 0.1em)',
            'repeating-linear-gradient(0deg, rgb(47 214 122 / 0.4) 0 0.06em, transparent 0.06em 0.85em)',
            'repeating-linear-gradient(90deg, rgb(47 214 122 / 0.28) 0 0.06em, transparent 0.06em 1.15em)',
          ].join(', '),
          backgroundSize: '0.85em 0.85em, auto, auto',
        }}
      />
    ),
  },
  // Starfield: a deep-space back — big and small stars on near-black blue.
  starfield: {
    back: () => (
      <div
        className="size-full"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'radial-gradient(circle at 24% 22%, var(--color-card-back-line) 0.09em, transparent 0.14em)',
            'radial-gradient(circle at 68% 38%, #fff 0.06em, transparent 0.1em)',
            'radial-gradient(circle at 42% 62%, var(--color-card-back-line) 0.07em, transparent 0.11em)',
            'radial-gradient(circle at 82% 76%, #fff 0.05em, transparent 0.09em)',
            'radial-gradient(circle at 16% 84%, #fff 0.06em, transparent 0.1em)',
            'radial-gradient(circle at 55% 12%, #fff 0.04em, transparent 0.08em)',
            'radial-gradient(circle at 50% 46%, rgb(143 168 255 / 0.25) 0 1.2em, transparent 1.8em)',
          ].join(', '),
        }}
      />
    ),
  },
  // Royal: the capstone — gold quatrefoil lattice on deep purple velvet.
  royal: {
    back: () => (
      <div
        className="grid size-full place-items-center"
        style={{
          backgroundColor: 'var(--color-card-back)',
          backgroundImage: [
            'repeating-linear-gradient(45deg, rgb(201 162 39 / 0.5) 0 0.06em, transparent 0.06em 0.85em)',
            'repeating-linear-gradient(-45deg, rgb(201 162 39 / 0.5) 0 0.06em, transparent 0.06em 0.85em)',
          ].join(', '),
        }}
      >
        <span
          className="grid place-items-center rounded-full border-[0.09em] px-[0.32em] py-[0.28em] leading-none"
          style={{
            borderColor: 'var(--color-card-back-line)',
            backgroundColor: 'var(--color-card-back)',
            color: 'var(--color-card-back-line)',
            fontSize: '1.15em',
          }}
        >
          ♛
        </span>
      </div>
    ),
  },
};
