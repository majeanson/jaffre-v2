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

const ROBOT = spriteToGrid(
  [
    '................',
    '......X..X......',
    '......X..X......',
    '.....GGGGGG.....',
    '....GGGGGGGG....',
    '....GWWGGWWG....',
    '....GWWGGWWG....',
    '....GGGGGGGG....',
    '....GGKKKKGG....',
    '....GGGGGGGG....',
    '.....GGGGGG.....',
    '......G..G......',
    '....GGGGGGGG....',
    '...G.GGGGGG.G...',
    '....GGGGGGGG....',
    '.....G....G.....',
  ],
  { X: '#8a7f9c', G: '#82c7dc', W: '#ffffff', K: '#0b0713' },
);

const GHOST = spriteToGrid(
  [
    '................',
    '................',
    '.....VVVVVV.....',
    '...VVVVVVVVVV...',
    '..VVVVVVVVVVVV..',
    '..VVWWVVVVWWVV..',
    '..VVWBVVVVWBVV..',
    '..VVWWVVVVWWVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VV.VV..VV.VV..',
    '..V..V....V..V..',
    '................',
  ],
  { V: '#7a6ff0', W: '#ffffff', B: '#0b0713' },
);

const CAT = spriteToGrid(
  [
    '................',
    '...O........O...',
    '...OO......OO...',
    '...OOOOOOOOOO...',
    '..OOOOOOOOOOOO..',
    '..OOKKOOOOKKOO..',
    '..OOKKOOOOKKOO..',
    '..OOOOOOOOOOOO..',
    '..OOOOOPPOOOOO..',
    '..OOOOPPPPOOOO..',
    '..OKOOOOOOOOKO..',
    '..OOOOOOOOOOOO..',
    '...OOOOOOOOOO...',
    '....OOOOOOOO....',
    '................',
    '................',
  ],
  { O: '#f2c66d', K: '#0b0713', P: '#ef9494' },
);

const STAR = spriteToGrid(
  [
    '................',
    '.......YY.......',
    '.......YY.......',
    '......YYYY......',
    '......YYYY......',
    '.YYYYYYYYYYYYYY.',
    '..YYYYYYYYYYYY..',
    '...YYYYYYYYYY...',
    '....YYYYYYYY....',
    '....YYYYYYYY....',
    '...YYYYYYYYYY...',
    '...YYYY..YYYY...',
    '..YYY......YYY..',
    '..YY........YY..',
    '.YY..........YY.',
    '................',
  ],
  { Y: '#f2b712' },
);

const INVADER = spriteToGrid(
  [
    '................',
    '................',
    '....X......X....',
    '.....X....X.....',
    '....XXXXXXXX....',
    '...XX.XXXX.XX...',
    '..XXXXXXXXXXXX..',
    '..X.XXXXXXXX.X..',
    '..X.X......X.X..',
    '.....XX..XX.....',
    '....XX....XX....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  { X: '#58b884' },
);

export interface Template {
  readonly id: string;
  readonly labelEn: string;
  readonly labelFr: string;
  readonly grid: Grid;
  /** The two OG bonhommes double as the red-0 / brown-0 scoring cards. Players
   * may pick them, but bots never wear them — a bot avatar that looked like a
   * bonhomme card would confuse the table (see paint/botAvatars). */
  readonly bonhomme?: boolean;
}

export const TEMPLATES: readonly Template[] = [
  { id: 'robot', labelEn: 'Robot', labelFr: 'Robot', grid: ROBOT },
  { id: 'smiley', labelEn: 'Smiley', labelFr: 'Sourire', grid: SMILEY },
  { id: 'cat', labelEn: 'Cat', labelFr: 'Chat', grid: CAT },
  { id: 'star', labelEn: 'Star', labelFr: 'Étoile', grid: STAR },
  { id: 'ghost', labelEn: 'Ghost', labelFr: 'Fantôme', grid: GHOST },
  { id: 'heart', labelEn: 'Heart', labelFr: 'Cœur', grid: HEART },
  { id: 'invader', labelEn: 'Invader', labelFr: 'Envahisseur', grid: INVADER },
  { id: 'joffre', labelEn: 'General', labelFr: 'Général', grid: JOFFRE, bonhomme: true },
  { id: 'allemagne', labelEn: 'Top hat', labelFr: 'Chapeau', grid: ALLEMAGNE, bonhomme: true },
];
