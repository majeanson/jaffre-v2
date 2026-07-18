import { useLang, type Lang } from '@jaffre/ui';
import { isLinked } from '../net/auth.js';

const T: Record<Lang, { nudge: string }> = {
  en: { nudge: 'Keep your games — tap Log in on the home screen.' },
  fr: { nudge: "Garde tes parties — touche Connexion à l'accueil." },
};

/** The one-line nudge for quiet moments (game recap, lobby) — muted text,
 * gone forever once anything is linked. Never a wall, never a modal. */
export function LinkNudge() {
  const t = T[useLang()];
  if (isLinked()) return null;
  return (
    <p className="text-center font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
      <span aria-hidden className="text-(--color-ap-gold)">
        ✦
      </span>{' '}
      {t.nudge}
    </p>
  );
}
