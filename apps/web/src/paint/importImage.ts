/**
 * Downsample any image data URL (a legacy PNG paint, say) into the 16×16 grid,
 * so an old freehand avatar can be brought into the pixel editor instead of
 * being thrown away. Browser-only (uses <canvas>); returns null on load or
 * read failure (e.g. a tainted/oversized source).
 */
import { GRID, type Cell, type Grid } from './model.js';

const toHex = (n: number): string => n.toString(16).padStart(2, '0');

export const importImageToGrid = (dataUrl: string): Promise<Grid | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = GRID;
        canvas.height = GRID;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return resolve(null);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, GRID, GRID);
        const { data } = ctx.getImageData(0, 0, GRID, GRID);
        const cells: Cell[] = [];
        for (let i = 0; i < GRID * GRID; i++) {
          const r = data[i * 4] ?? 0;
          const g = data[i * 4 + 1] ?? 0;
          const b = data[i * 4 + 2] ?? 0;
          const a = data[i * 4 + 3] ?? 0;
          cells.push(a < 128 ? null : `#${toHex(r)}${toHex(g)}${toHex(b)}`);
        }
        resolve(cells);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
