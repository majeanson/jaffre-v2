import { PixelWave, useLang, type Lang } from '@jaffre/ui';

const T: Record<Lang, { waiting: string }> = {
  en: { waiting: 'Waiting for the game…' },
  fr: { waiting: 'En attente de la partie…' },
};

/** Owns the pre-game placeholder shown until the first view arrives. The
 * PixelWave loader (the meta screens' idiom) replaces the old lone pulsing
 * line, which read as a blank/broken page — especially on the light theme,
 * where the pulse dipped the only text on screen to near-invisible. */
export function WaitingScreen() {
  const t = T[useLang()];
  return (
    <main className="table-felt grid min-h-full place-items-center">
      <PixelWave label={t.waiting} />
    </main>
  );
}
