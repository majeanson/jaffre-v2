import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { SLOT_STATUS, useBottomSlot } from './bottomSlot.js';
import { momentHref, type ProgressMoment } from '../progress.js';
import { feedback } from '../audio/clicks.js';

const T: Record<
  Lang,
  {
    level: (n: number) => string;
    award: string;
    unlocked: string;
    foil: (label: string) => string;
    equip: string;
    see: string;
    more: (n: number) => string;
  }
> = {
  en: {
    level: (n) => `Level ${String(n)}`,
    award: 'Award earned',
    unlocked: 'Unlocked',
    foil: (label) => `Foil ${label}!`,
    equip: 'Equip',
    see: 'See',
    more: (n) => `+${String(n)} more`,
  },
  fr: {
    level: (n) => `Niveau ${String(n)}`,
    award: 'Récompense obtenue',
    unlocked: 'Débloqué',
    foil: (label) => `${label} en foil !`,
    equip: 'Équiper',
    see: 'Voir',
    more: (n) => `+${String(n)} autre${n === 1 ? '' : 's'}`,
  },
};

/** How long one moment holds the slot before the next takes over. Longer than
 * a status toast: this one has something to read AND a button to consider. */
const DWELL_MS = 5200;

export interface ProgressToastProps {
  readonly moments: readonly ProgressMoment[];
  /** Called once every moment has been shown. */
  readonly onDone: () => void;
}

/**
 * Announces what you just earned — a level, an award, a cosmetic — one at a
 * time, each with a way to go and use it.
 *
 * ONE surface for all three on purpose. They arrive together (finishing a game
 * can level you up, earn an award and unlock a deck in the same instant), and
 * three competing toast styles would turn a good moment into clutter. They
 * queue instead, newest thing last, so the sequence reads like a small
 * post-game summary.
 */
export function ProgressToast({ moments, onDone }: ProgressToastProps) {
  const t = T[useLang()];
  const visible = useBottomSlot(SLOT_STATUS, moments.length > 0);
  const [index, setIndex] = useState(0);
  const moment = moments[index];

  // Sound only on the first one: a run of three chimes is a nuisance, and the
  // point is "something happened", which one chime already says.
  useEffect(() => {
    if (visible && index === 0) feedback('select');
  }, [visible, index]);

  useEffect(() => {
    if (!visible || moment === undefined) return undefined;
    const id = setTimeout(() => {
      if (index + 1 < moments.length) setIndex(index + 1);
      else onDone();
    }, DWELL_MS);
    return () => clearTimeout(id);
  }, [visible, index, moment, moments.length, onDone]);

  if (!visible || moment === undefined) return null;

  const remaining = moments.length - index - 1;
  const icon =
    moment.kind === 'award'
      ? moment.icon
      : moment.kind === 'level'
        ? '⬆'
        : moment.kind === 'foil'
          ? '✨'
          : '🎁';
  const heading =
    moment.kind === 'level'
      ? t.level(moment.level)
      : moment.kind === 'award'
        ? t.award
        : moment.kind === 'foil'
          ? t.foil(moment.label)
          : t.unlocked;
  const detail =
    moment.kind === 'level'
      ? moment.rewards.map((r) => r.label).join(' · ')
      : moment.kind === 'award'
        ? moment.name
        : moment.kind === 'foil'
          ? '' // the label already rides in the "Foil <name>!" heading
          : moment.label;
  // "Equip" only when the link lands on a specific cosmetic tile; a bare level
  // or award goes to the screen that explains it, which is a "See".
  const action =
    moment.kind === 'cosmetic' || moment.kind === 'foil'
      ? t.equip
      : moment.kind === 'level'
        ? moment.rewards.length > 0
          ? t.equip
          : t.see
        : moment.reward !== null
          ? t.equip
          : t.see;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="progress-toast"
      className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) py-2 pr-2 pl-3.5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap)"
    >
      <span aria-hidden className="text-[1.35em] leading-none">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-arcade-display text-[0.8em] uppercase tracking-wide text-(--color-ap-gold)">
          {heading}
          {remaining > 0 && (
            <span className="ml-2 text-(--color-ap-muted)">{t.more(remaining)}</span>
          )}
        </span>
        {detail !== '' && <span className="truncate text-[0.9em]">{detail}</span>}
      </span>
      <a
        href={momentHref(moment)}
        onClick={onDone}
        className="shrink-0 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-2.5 py-1 text-[0.75em] font-semibold tracking-wide text-(--color-ap-ink) uppercase shadow-(--shadow-ap-sm)"
      >
        {action}
      </a>
    </div>
  );
}
