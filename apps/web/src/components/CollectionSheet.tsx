import { useEffect } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { Collection } from '../screens/Collection.js';
import { useScrollLock } from './useScrollLock.js';

const T: Record<Lang, { close: string; collection: string }> = {
  en: { close: 'Close', collection: 'Collection' },
  fr: { close: 'Fermer', collection: 'Collection' },
};

/**
 * The Collection gallery shown as a full-screen modal OVER the table — like the
 * How-to-play sheet — so changing skins mid-game never navigates away from the
 * game (the table stays mounted underneath). Escape closes it. Reuses the exact
 * same `Collection` view as the `#collection` route; only the leave button reads
 * "Close" instead of "Home".
 */
export function CollectionSheet({ onClose }: { readonly onClose: () => void }) {
  const t = T[useLang()];
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // role/aria-modal are load-bearing, not decoration: the table stays mounted
    // and live under this sheet, and the felt's keyboard shortcuts refuse to
    // fire while a modal dialog is open (useTableKeys' typingElsewhere). Without
    // them, pressing 1–8 here would play a card you can't see.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.collection}
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
    >
      <Collection onLeave={onClose} leaveLabel={t.close} />
    </div>
  );
}
