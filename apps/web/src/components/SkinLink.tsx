import { useLang, type Lang } from '@jaffre/ui';
import { CARD_SKINS, DEFAULT_CARD_SKIN, currentCardSkin } from '../cosmetics.js';
import { COLLECTION_RETURN_KEY } from '../screens/Collection.js';

const T: Record<Lang, { skins: string }> = {
  en: { skins: 'Skins' },
  fr: { skins: 'Habillages' },
};

/**
 * Skin/theme entry point + equipped indicator. All cosmetic choices now live in
 * the Collection gallery (live previews, locked state, unlock progress), so this
 * — formerly an inline dropdown — just routes to `#collection`. When a non-default
 * card skin is equipped it names it (e.g. "OG Deck") so Home shows your current
 * look at a glance; otherwise it reads "Skins". Used in the Home chrome and the
 * in-game options drawer; a plain hash link so the router handles it and it's
 * keyboard-accessible. Stashes the current route first so the gallery's back
 * button returns you here (e.g. straight back into a game in progress), not Home.
 */
export function SkinLink() {
  const t = T[useLang()];
  const skinId = currentCardSkin();
  const equipped =
    skinId === DEFAULT_CARD_SKIN ? null : (CARD_SKINS.find((c) => c.id === skinId)?.label ?? null);
  return (
    <a
      href="#collection"
      onClick={() => {
        const here = location.hash;
        if (here !== '#collection') sessionStorage.setItem(COLLECTION_RETURN_KEY, here);
      }}
      className="inline-flex items-center gap-1.5 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2.5 py-1.5 font-arcade-ui text-xs text-(--color-ap-muted) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <span aria-hidden className="text-(--color-ap-gold)">
        ◆
      </span>
      {equipped ?? t.skins}
    </a>
  );
}
