/**
 * Live "how it reads in play" — the current grid rendered at the three real
 * sizes it appears in game (seat chip 2.1em, own 0-card 2.6em, hero avatar 4em)
 * over the profile colour, using the exact serialization + <img object-cover>
 * path the real sites use. Small art that looks like mush here will look like
 * mush at the table, so this is where you catch it.
 */
import { useMemo } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { gridToDataUrl } from './svg.js';
import { isBlank } from './model.js';
import type { EditorState } from './editor.js';

const T: Record<Lang, { preview: string; seat: string; card: string; avatar: string }> = {
  en: { preview: 'In play', seat: 'Seat', card: 'Card', avatar: 'Avatar' },
  fr: { preview: 'En jeu', seat: 'Siège', card: 'Carte', avatar: 'Avatar' },
};

function Chip({
  size,
  src,
  bg,
  label,
}: {
  size: string;
  src: string | null;
  bg: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[0.4em]">
      <span
        className="relative grid place-items-center overflow-hidden rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm)"
        style={{ width: size, height: size, background: bg }}
      >
        {src !== null && (
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </span>
      <span className="font-arcade-ui text-[0.62em] font-semibold uppercase tracking-[0.12em] text-(--color-ap-muted)">
        {label}
      </span>
    </div>
  );
}

export interface PreviewStripProps {
  readonly state: EditorState;
  /** The profile colour that shows through transparent cells at every site. */
  readonly baseColor: string;
}

export function PreviewStrip({ state, baseColor }: PreviewStripProps) {
  const t = T[useLang()];
  const src = useMemo(() => (isBlank(state.grid) ? null : gridToDataUrl(state.grid)), [state.grid]);
  return (
    <div
      role="group"
      aria-label={t.preview}
      className="flex items-end justify-center gap-[1.2em] text-[1rem]"
    >
      <Chip size="2.1em" src={src} bg={baseColor} label={t.seat} />
      <Chip size="2.6em" src={src} bg={baseColor} label={t.card} />
      <Chip size="4em" src={src} bg={baseColor} label={t.avatar} />
    </div>
  );
}
