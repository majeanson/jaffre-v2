import { useEffect } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { Collection } from '../screens/Collection.js';
import { useScrollLock } from './useScrollLock.js';

const T: Record<Lang, { close: string }> = {
  en: { close: 'Close' },
  fr: { close: 'Fermer' },
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
    <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain">
      <Collection onLeave={onClose} leaveLabel={t.close} />
    </div>
  );
}
