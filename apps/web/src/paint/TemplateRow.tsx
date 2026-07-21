/**
 * Starter templates — tap one to drop it onto the grid (undoable, like any
 * edit). Thumbnails are the same crisp pixel SVG the grid produces, so what you
 * see is what you get.
 */
import { useLang, type Lang } from '@jaffre/ui';
import { GRID, getCell } from './model.js';
import { TEMPLATES, type Template } from './templates.js';
import type { EditorAction } from './editor.js';

const T: Record<Lang, { starters: string; use: (name: string) => string }> = {
  en: { starters: 'Starters', use: (name) => `Use the ${name} starter` },
  fr: { starters: 'Modèles', use: (name) => `Utiliser le modèle ${name}` },
};

function Thumb({ template }: { template: Template }) {
  return (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} shapeRendering="crispEdges" className="size-full">
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const x = i % GRID;
        const y = Math.floor(i / GRID);
        const c = getCell(template.grid, x, y);
        return c === null ? null : <rect key={i} x={x} y={y} width={1} height={1} fill={c} />;
      })}
    </svg>
  );
}

export interface TemplateRowProps {
  readonly dispatch: React.Dispatch<EditorAction>;
}

export function TemplateRow({ dispatch }: TemplateRowProps) {
  const lang = useLang();
  const t = T[lang];
  return (
    <div className="flex flex-col items-center gap-[0.5em]">
      <span className="font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
        {t.starters}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-[0.5em]">
        {TEMPLATES.map((template) => {
          const name = lang === 'fr' ? template.labelFr : template.labelEn;
          return (
            <button
              key={template.id}
              type="button"
              aria-label={t.use(name)}
              title={name}
              data-testid={`template-${template.id}`}
              onClick={() => dispatch({ t: 'load', grid: template.grid })}
              className="grid size-[2.8em] place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.2em] shadow-(--shadow-ap-sm) transition hover:bg-(--color-ap-panel-hover) hover:brightness-105"
            >
              <Thumb template={template} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
