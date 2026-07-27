import { useLang, type Lang } from '@jaffre/ui';
import { CARD_SKINS, DEFAULT_CARD_SKIN, currentCardSkin } from '../cosmetics.js';
import { ICON_BTN_NEUTRAL } from './IconButton.js';
import { IconPalette } from './icons.js';

const T: Record<Lang, { collection: string }> = {
  en: { collection: 'Collection' },
  fr: { collection: 'Collection' },
};

/**
 * Collection entry point — the SAME palette icon as the in-game Skins button,
 * so "skins live behind the palette" reads identically everywhere. All cosmetic
 * choices live in the Collection gallery; this routes to `#collection`. When a
 * non-default card skin is equipped the tooltip names it (e.g. "OG Deck").
 * A plain hash link so the router handles it and it's keyboard-accessible.
 * The gallery's own back goes through history, so no return route is stashed.
 */
export function SkinLink() {
  const t = T[useLang()];
  const skinId = currentCardSkin();
  const equipped =
    skinId === DEFAULT_CARD_SKIN ? null : (CARD_SKINS.find((c) => c.id === skinId)?.label ?? null);
  return (
    <a
      href="#collection"
      aria-label={t.collection}
      title={equipped === null ? t.collection : `${t.collection} · ${equipped}`}
      className={ICON_BTN_NEUTRAL}
    >
      <IconPalette />
    </a>
  );
}
