/**
 * Starter sprites the studio offers as a jumping-off point. Two are the OG
 * "bonhommes" (General Joffre / the top-hat figure) from Bonhomme.tsx, converted
 * to 16×16 grids with literal hexes — the originals use suit CSS vars/color-mix
 * which can't live in a saved SVG, so these are fixed approximations (they won't
 * recolour with card skins the way the live Bonhomme does; fine for a starter).
 * Two more (smiley, heart) are drawn straight on the 16×16 grid.
 */
import { GRID, emptyGrid, type Cell, type Grid } from './model.js';

type Palette = Record<string, string>;

/** Paint a char-rows sprite into a fresh 16×16 grid at an offset. '.' = skip. */
function spriteToGrid(rows: readonly string[], palette: Palette, ox = 0, oy = 0): Grid {
  const cells = emptyGrid().slice() as Cell[];
  rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      const x = rx + ox;
      const y = ry + oy;
      if (x >= 0 && x < GRID && y >= 0 && y < GRID) cells[y * GRID + x] = palette[ch] ?? null;
    });
  });
  return cells;
}

/** 12×13 → centred with a 2px side margin, 1px top. */
const JOFFRE = spriteToGrid(
  [
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
  { K: '#e05252', D: '#7b2d2d', F: '#f3baba', B: '#0b0713', G: '#b9bec9' },
  2,
  1,
);

const ALLEMAGNE = spriteToGrid(
  [
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
  {
    N: '#5a3d1c',
    L: '#b07a2e',
    E: '#cda56a',
    W: '#f2ead8',
    T: '#3d3866',
    g: '#6fae4e',
    b: '#4a8fc7',
  },
  2,
  1,
);

const SMILEY = spriteToGrid(
  [
    '................',
    '....YYYYYYYY....',
    '..YYYYYYYYYYYY..',
    '.YYYYYYYYYYYYYY.',
    '.YYYYYYYYYYYYYY.',
    'YYYYYYYYYYYYYYYY',
    'YYYKKYYYYYYKKYYY',
    'YYYKKYYYYYYKKYYY',
    'YYYYYYYYYYYYYYYY',
    'YYYYYYYYYYYYYYYY',
    'YYKYYYYYYYYYYKYY',
    'YYKKYYYYYYYYKKYY',
    '.YYYKKKKKKKKYYY.',
    '.YYYYYYYYYYYYYY.',
    '..YYYYYYYYYYYY..',
    '....YYYYYYYY....',
  ],
  { Y: '#f2b712', K: '#0b0713' },
);

const HEART = spriteToGrid(
  [
    '................',
    '...RRR....RRR...',
    '..RRRRR..RRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.RRRRRRRRRRRRRR.',
    '.RRRRRRRRRRRRRR.',
    '..RRRRRRRRRRRR..',
    '..RRRRRRRRRRRR..',
    '...RRRRRRRRRR...',
    '....RRRRRRRR....',
    '.....RRRRRR.....',
    '......RRRR......',
    '.......RR.......',
    '................',
    '................',
    '................',
  ],
  { R: '#e05252' },
);

export interface Template {
  readonly id: string;
  readonly labelEn: string;
  readonly labelFr: string;
  readonly grid: Grid;
}

export const TEMPLATES: readonly Template[] = [
  { id: 'joffre', labelEn: 'General', labelFr: 'Général', grid: JOFFRE },
  { id: 'allemagne', labelEn: 'Top hat', labelFr: 'Chapeau', grid: ALLEMAGNE },
  { id: 'smiley', labelEn: 'Smiley', labelFr: 'Sourire', grid: SMILEY },
  { id: 'heart', labelEn: 'Heart', labelFr: 'Cœur', grid: HEART },
];
