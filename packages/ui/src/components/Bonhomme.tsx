/**
 * The "bonhommes" — the character portraits from the OG Jaffré card skins.
 * Only the two scoring specials carry one: red 0 (+5) is General Joffre
 * (kepi, pixel shades, mustache — France in the OG deck) and brown 0 (−3)
 * is the dark top-hat figure (Allemagne). Redrawn as grid pixel-art SVG so
 * they stay crisp at any card size, with body tones derived from the suit
 * CSS variables so every skin recolours them automatically.
 */
export type BonhommeKind = 'joffre' | 'allemagne';

type Palette = Record<string, string>;

const RED = 'var(--color-suit-red)';
const BROWN = 'var(--color-suit-brown)';

/** '.' = transparent; every other char looks up a fill in the palette. */
interface Sprite {
  readonly rows: readonly string[];
  readonly palette: Palette;
}

const JOFFRE: Sprite = {
  rows: [
    '....KKKK....',
    '..KKKKKKKK..',
    '..KKKKKKKK..',
    '.KKKKKKKKKK.',
    '..FFFFFFFF..',
    '.BBGBBBBGBB.',
    '..FFFFFFFF..',
    '.DDDDDDDDDD.',
    '.DDFFFFFFDD.',
    '...FFFFFF...',
    '..KKKKKKKK..',
    '.KKKKKKKKKK.',
    'KKKKKKKKKKKK',
  ],
  palette: {
    K: RED,
    D: `color-mix(in srgb, ${RED} 55%, black)`,
    F: `color-mix(in srgb, ${RED} 40%, white)`,
    B: 'var(--color-ap-ink)',
    G: '#b9bec9',
  },
};

const ALLEMAGNE: Sprite = {
  rows: [
    '...TTTTTT...',
    '...TTTTTT...',
    '...TTTTTT...',
    '...gggbbb...',
    '.TTTTTTTTTT.',
    '...NNNNNN...',
    '..NNENNENN..',
    '..NNNNNNNN..',
    '..NWWWWWWN..',
    '...NNNNNN...',
    '..NNNNNNNN..',
    '.NNNNLNNNNN.',
    'NNNLNNNNLNNN',
  ],
  palette: {
    N: `color-mix(in srgb, ${BROWN} 35%, black)`,
    L: BROWN,
    E: `color-mix(in srgb, ${BROWN} 60%, white)`,
    W: '#f2ead8',
    T: '#3d3866',
    g: '#6fae4e',
    b: '#4a8fc7',
  },
};

const SPRITES: Record<BonhommeKind, Sprite> = { joffre: JOFFRE, allemagne: ALLEMAGNE };

export interface BonhommeProps {
  readonly kind: BonhommeKind;
  /** Rendered width as a CSS length (default 3em) — height follows the grid. */
  readonly size?: string;
  readonly className?: string;
}

export function Bonhomme({ kind, size = '3em', className = '' }: BonhommeProps) {
  const { rows, palette } = SPRITES[kind];
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: size, height: 'auto' }}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} />
          ),
        ),
      )}
    </svg>
  );
}
