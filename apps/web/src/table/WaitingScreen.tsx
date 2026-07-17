import { useLang, type Lang } from '@jaffre/ui';

const T: Record<Lang, { waiting: string }> = {
  en: { waiting: 'Waiting for the game…' },
  fr: { waiting: 'En attente de la partie…' },
};

/** Owns the pre-game placeholder shown until the first view arrives. */
export function WaitingScreen() {
  const t = T[useLang()];
  return (
    <main className="table-felt grid min-h-screen place-items-center">
      <p className="animate-pulse font-arcade-display uppercase tracking-wide text-(--color-ap-muted)">
        {t.waiting}
      </p>
    </main>
  );
}
