import { useLang, type Lang } from '@jaffre/ui';

export interface MetaNavProps {
  readonly current: 'corner' | 'journey' | 'collection' | 'awards' | 'stats' | 'leaderboard';
}

const ITEMS = [
  { id: 'corner', hash: '#corner' },
  { id: 'journey', hash: '#journey' },
  { id: 'collection', hash: '#collection' },
  { id: 'awards', hash: '#awards' },
  { id: 'stats', hash: '#stats' },
  { id: 'leaderboard', hash: '#leaderboard' },
] as const;

const T: Record<
  Lang,
  {
    corner: string;
    journey: string;
    collection: string;
    awards: string;
    stats: string;
    leaderboard: string;
  }
> = {
  en: {
    corner: 'Your corner',
    journey: 'Journey',
    collection: 'Collection',
    awards: 'Awards',
    stats: 'Your record',
    leaderboard: 'Leaderboard',
  },
  fr: {
    corner: 'Ton coin',
    journey: 'Parcours',
    collection: 'Collection',
    awards: 'Récompenses',
    stats: 'Ton record',
    leaderboard: 'Classement',
  },
};

// flex-1 + a shared basis: every tab in a row gets the same width and each row
// fills the strip edge-to-edge — no ragged centered chips.
const TAB_BASE =
  'flex flex-1 basis-[8.5rem] items-center justify-center whitespace-nowrap rounded-(--radius-ap-control) border-2 px-3 py-1.5 font-arcade-ui text-[0.72em] uppercase tracking-wide shadow-(--shadow-ap-sm)';

const CHIP_CLASS = `${TAB_BASE} border-(--color-ap-ink) bg-(--color-ap-ground) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)`;

const CURRENT_CLASS = `${TAB_BASE} border-(--color-ap-violet) bg-(--color-ap-panel) text-(--color-ap-violet-soft)`;

/**
 * The subtab row of the "Your corner" sheet — every meta screen (corner,
 * journey, collection, awards, record, leaderboard) shows the same strip, so
 * the map never has to be relearned. Home stays the only place with the big
 * doors.
 */
export function MetaNav({ current }: MetaNavProps) {
  const t = T[useLang()];
  return (
    <nav className="flex w-full flex-wrap gap-2">
      {ITEMS.map((item) => {
        const label = t[item.id];
        return item.id === current ? (
          <span key={item.id} aria-current="page" className={CURRENT_CLASS}>
            {label}
          </span>
        ) : (
          <a key={item.id} href={item.hash} className={CHIP_CLASS}>
            {label}
          </a>
        );
      })}
    </nav>
  );
}
