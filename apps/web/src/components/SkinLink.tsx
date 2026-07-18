import { useLang, type Lang } from '@jaffre/ui';
import { CARD_SKINS, DEFAULT_CARD_SKIN, currentCardSkin } from '../cosmetics.js';
import { COLLECTION_RETURN_KEY } from '../screens/Collection.js';
import { ICON_BTN_NEUTRAL } from './IconButton.js';
import { IconCards } from './icons.js';

const T: Record<Lang, { collection: string }> = {
  en: { collection: 'Collection' },
  fr: { collection: 'Collection' },
};

/**
 * Collection entry point — the SAME cards icon as the in-game Skins button, so
 * "skins live behind the cards icon" reads identically everywhere. All cosmetic
 * choices live in the Collection gallery; this routes to `#collection`. When a
 * non-default card skin is equipped the tooltip names it (e.g. "OG Deck").
 * A plain hash link so the router handles it and it's keyboard-accessible.
 * Stashes the current route first so the gallery's back button returns here.
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
      onClick={() => {
        const here = location.hash;
        if (here !== '#collection') sessionStorage.setItem(COLLECTION_RETURN_KEY, here);
      }}
      className={ICON_BTN_NEUTRAL}
    >
      <IconCards />
    </a>
  );
}
