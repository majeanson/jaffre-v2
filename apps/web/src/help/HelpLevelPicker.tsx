import { useLang, type Lang } from '@jaffre/ui';
import { HELP_LEVELS, setHelpLevel, useHelpLevel, type HelpLevel } from './helpLevel.js';

/** The dial's copy, shared by every surface that names a level — the picker
 * here, Settings' row, and the escape hatches on the hints themselves. */
export const HELP_T: Record<
  Lang,
  {
    help: string;
    level: Record<HelpLevel, string>;
    levelHint: Record<HelpLevel, string>;
    hideTips: string;
    knowRules: string;
    tipsOff: string;
  }
> = {
  en: {
    help: 'Help',
    level: { learning: 'Learning', coach: 'Coach', off: 'Off' },
    levelHint: {
      learning: 'Tips, tutorial marks and move suggestions.',
      coach: 'Move suggestions only.',
      off: 'Nothing. You know the game.',
    },
    hideTips: 'Hide tips',
    knowRules: 'I know the rules',
    tipsOff: 'Tips off',
  },
  fr: {
    help: 'Aide',
    level: { learning: 'Apprentissage', coach: 'Coach', off: 'Aucune' },
    levelHint: {
      learning: 'Conseils, repères et suggestions de coups.',
      coach: 'Seulement les suggestions de coups.',
      off: 'Rien. Tu connais le jeu.',
    },
    hideTips: 'Cacher les conseils',
    knowRules: 'Je connais les règles',
    tipsOff: 'Conseils fermés',
  },
};

/**
 * THE control for the help dial — three segments, one selected. Mounted in
 * Settings, in the table's Options drawer and in the Help sheet; they cannot
 * drift because they are this component reading one reactive value, not three
 * `useState`s racing to write one key (which is what the Coach toggle was).
 *
 * Gold-on-ink for the selected segment, matching the language picker it copies:
 * violet backgrounds pair with ink here, never white, and a violet fill would
 * put muted-on-violet text at the two unselected segments.
 */
export function HelpLevelPicker({ label }: { readonly label?: string }) {
  const t = HELP_T[useLang()];
  const level = useHelpLevel();
  return (
    <span className="flex items-center gap-2">
      {label !== undefined && (
        <span className="font-arcade-display text-xs uppercase tracking-wide text-(--color-ap-muted)">
          {label}
        </span>
      )}
      <span role="group" aria-label={t.help} className="flex items-stretch gap-1.5">
        {HELP_LEVELS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={level === id}
            title={t.levelHint[id]}
            onClick={() => setHelpLevel(id)}
            className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1.5 font-arcade-display text-xs uppercase shadow-(--shadow-ap-sm) ${
              level === id
                ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                : 'bg-(--color-ap-panel) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover)'
            }`}
          >
            {t.level[id]}
          </button>
        ))}
      </span>
    </span>
  );
}
