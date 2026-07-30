import { lazy, Suspense, useRef } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { useScrollLock } from './useScrollLock.js';
import { useDismissLayer } from '../keys/layers.js';

/**
 * Loaded on open, not with the app. App.tsx lazies the `#collection` route, but
 * this sheet is reached from the table's TopBar — which IS the eager path — so a
 * static import here pulled the whole gallery (every skin preview, theme swatch
 * and sweep demo) into the one index chunk every first-time visitor downloads
 * before the title screen. Rollup said so on every build: "dynamic import will
 * not move module into another chunk".
 */
const Collection = lazy(() =>
  import('../screens/Collection.js').then((m) => ({ default: m.Collection })),
);

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
  const panel = useRef<HTMLDivElement>(null);
  // Escape, the Tab trap and handing focus back to whatever opened this all
  // come from the one app-wide stack now — so a sheet opened over another
  // surface closes exactly one thing per press.
  useDismissLayer(panel, onClose, { trap: true });

  return (
    // role/aria-modal are load-bearing, not decoration: the table stays mounted
    // and live under this sheet, and the felt's keyboard shortcuts refuse to
    // fire while a modal dialog is open (useTableKeys' typingElsewhere). Without
    // them, pressing 1–8 here would play a card you can't see.
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t.collection}
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
    >
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-(--color-ap-ground)">
            <PixelWave label="…" />
          </div>
        }
      >
        <Collection onLeave={onClose} leaveLabel={t.close} />
      </Suspense>
    </div>
  );
}
