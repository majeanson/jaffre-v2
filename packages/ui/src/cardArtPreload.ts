/**
 * Card art is the one part of a card that arrives over the network: the OG
 * deck's portraits and emblems are JPGs under /og-cards. Without this, the
 * first Red 0 of a game starts its 43KB fetch AT THE MOMENT it lands on the
 * felt — the card flips to a blank face and pops in a beat later. The same
 * goes for the OG deck's every card and its face-down back.
 *
 * So we warm exactly the files the player's ACTIVE cosmetics can draw, as soon
 * as we know what those are. A player on the arcade skin with a painted
 * bonhomme fetches nothing here; nobody pays for art they can't see.
 *
 * Decoding matters as much as fetching: an image in the HTTP cache still costs
 * a decode on first paint, which is its own visible hitch on a phone. We call
 * `decode()` so the bitmap is ready, not just the bytes.
 */

const SUITS = ['red', 'brown', 'green', 'blue'] as const;

/** The `<img>` sources a skin + bonhomme mode can actually render. Keep in
 * lockstep with the renderers in cardSkin.tsx (ogArt / ogBonhomme / back). */
export function cardArtUrls(skinId: string, bonhommeSkin?: string): readonly string[] {
  const urls = new Set<string>();
  // The 'og' bonhomme mode forces the portraits onto every 0-card, whatever
  // the card skin is — a third, independent axis.
  const needsPortraits = bonhommeSkin === 'og' || skinId === 'classic-og' || skinId === 'og-deck';
  if (needsPortraits) for (const s of SUITS) urls.add(`/og-cards/${s}_bon.jpg`);
  // The full OG deck also prints an emblem on 1–7, and its card back is the
  // red emblem (already covered by the emblem loop).
  if (skinId === 'og-deck') for (const s of SUITS) urls.add(`/og-cards/${s}_emblem.jpg`);
  return [...urls];
}

/** Sources already warmed this session — the work is idempotent and cheap to
 * re-request, but re-decoding on every skin toggle is not. */
const warmed = new Set<string>();

/**
 * Fetch + decode the card art for these cosmetics. Safe to call often (on
 * boot, on every skin change, on entering a table): each source is warmed at
 * most once per session. Never throws and never blocks — a failed preload
 * just means the normal `<img>` load happens later, exactly as before.
 */
export function preloadCardArt(skinId: string, bonhommeSkin?: string): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  for (const src of cardArtUrls(skinId, bonhommeSkin)) {
    if (warmed.has(src)) continue;
    warmed.add(src);
    try {
      const img = new Image();
      // Off the critical path: the felt is interactive long before these
      // matter, and a game's first deal is seconds away at minimum.
      img.decoding = 'async';
      img.src = src;
      // decode() rejects on a load failure — swallow it (the <img> in the card
      // will retry on its own) and never surface an unhandled rejection.
      void img.decode?.().catch(() => undefined);
    } catch {
      // An exotic environment without Image construction — nothing to warm.
    }
  }
}
