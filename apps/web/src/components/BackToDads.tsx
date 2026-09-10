import { useLang, type Lang } from '@jaffre/ui';
import { backLink, isEmbedded } from '../embed.js';

const T: Record<Lang, { back: string }> = {
  en: { back: '← the dads' },
  fr: { back: '← les papas' },
};

/**
 * The way back to whoever sent you here.
 *
 * Only for the player who opened the table in its own tab: inside the frame
 * the embedder is already on screen, so a link back to it would be a link to
 * where you already are.
 *
 * Bottom-left rather than top: OfflineBanner owns the top edge, and this must
 * never sit on top of a notice that matters more than it does.
 */
export function BackToDads() {
  const t = T[useLang()];
  const href = backLink();
  if (href === null || isEmbedded()) return null;
  return (
    <a
      data-testid="back-to-dads"
      href={href}
      className="fixed bottom-3 left-3 z-[60] rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-3 py-1 font-arcade-ui text-xs font-medium text-(--color-ap-ink) hover:opacity-80"
    >
      {t.back}
    </a>
  );
}
