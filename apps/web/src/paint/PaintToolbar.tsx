/**
 * The tool rail: a radiogroup of the six tools, the mirror / filled-rect
 * toggles, and undo / redo / clear actions. All controls are real buttons with
 * accessible names and aria-checked/aria-pressed state so the studio is fully
 * keyboard- and screen-reader operable (per-cell keyboard painting is out of
 * scope — the tools and palette carry the interaction).
 */
import { ARCADE, useLang, type Lang } from '@jaffre/ui';
import { TOOLS, type Tool, type EditorState, type EditorAction } from './editor.js';
import {
  IconDropper,
  IconEraser,
  IconFill,
  IconLine,
  IconMirror,
  IconPencil,
  IconRect,
  IconRedo,
  IconTrash,
  IconUndo,
} from './icons.js';

const T: Record<
  Lang,
  {
    tools: string;
    pencil: string;
    eraser: string;
    fill: string;
    eyedropper: string;
    line: string;
    rect: string;
    mirror: string;
    filled: string;
    undo: string;
    redo: string;
    clear: string;
  }
> = {
  en: {
    tools: 'Tools',
    pencil: 'Pencil',
    eraser: 'Eraser',
    fill: 'Fill',
    eyedropper: 'Eyedropper',
    line: 'Line',
    rect: 'Rectangle',
    mirror: 'Mirror',
    filled: 'Filled rectangle',
    undo: 'Undo',
    redo: 'Redo',
    clear: 'Clear all',
  },
  fr: {
    tools: 'Outils',
    pencil: 'Crayon',
    eraser: 'Efface',
    fill: 'Remplir',
    eyedropper: 'Pipette',
    line: 'Ligne',
    rect: 'Rectangle',
    mirror: 'Miroir',
    filled: 'Rectangle plein',
    undo: 'Annuler',
    redo: 'Refaire',
    clear: 'Tout effacer',
  },
};

const TOOL_ICON: Record<Tool, React.ReactNode> = {
  pencil: <IconPencil />,
  eraser: <IconEraser />,
  fill: <IconFill />,
  eyedropper: <IconDropper />,
  line: <IconLine />,
  rect: <IconRect />,
};

/** A pressed/selected control gets the violet fill; idle stays panel neutral. */
const cell = (active: boolean, disabled = false): string =>
  `${ARCADE.iconBtnBase} ${ARCADE.press} ${
    disabled
      ? 'cursor-not-allowed bg-(--color-ap-panel) text-(--color-ap-muted) opacity-45'
      : active
        ? 'cursor-pointer bg-(--color-ap-violet) text-(--color-ap-ink)'
        : `cursor-pointer ${ARCADE.iconBtnNeutral}`
  }`;

export interface PaintToolbarProps {
  readonly state: EditorState;
  readonly dispatch: React.Dispatch<EditorAction>;
}

export function PaintToolbar({ state, dispatch }: PaintToolbarProps) {
  const t = T[useLang()];
  const toolLabel: Record<Tool, string> = {
    pencil: t.pencil,
    eraser: t.eraser,
    fill: t.fill,
    eyedropper: t.eyedropper,
    line: t.line,
    rect: t.rect,
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-[0.5em]">
      <div
        role="radiogroup"
        aria-label={t.tools}
        data-testid="paint-tools"
        className="flex flex-wrap items-center justify-center gap-[0.4em]"
      >
        {TOOLS.map((tool) => {
          const active = state.tool === tool;
          return (
            <button
              key={tool}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={toolLabel[tool]}
              title={toolLabel[tool]}
              data-testid={`tool-${tool}`}
              onClick={() => dispatch({ t: 'setTool', tool })}
              className={cell(active)}
            >
              {TOOL_ICON[tool]}
            </button>
          );
        })}
      </div>

      <span className={`${ARCADE.divider} h-[1.6em]`} aria-hidden />

      <button
        type="button"
        aria-label={t.mirror}
        aria-pressed={state.mirror}
        title={t.mirror}
        data-testid="tool-mirror"
        onClick={() => dispatch({ t: 'toggleMirror' })}
        className={cell(state.mirror)}
      >
        <IconMirror />
      </button>
      <button
        type="button"
        aria-label={t.filled}
        aria-pressed={state.rectFilled}
        title={t.filled}
        data-testid="tool-filled"
        onClick={() => dispatch({ t: 'toggleRectFilled' })}
        className={cell(state.rectFilled)}
      >
        <IconRect filled />
      </button>

      <span className={`${ARCADE.divider} h-[1.6em]`} aria-hidden />

      <button
        type="button"
        aria-label={t.undo}
        title={t.undo}
        data-testid="tool-undo"
        disabled={state.past.length === 0}
        onClick={() => dispatch({ t: 'undo' })}
        className={cell(false, state.past.length === 0)}
      >
        <IconUndo />
      </button>
      <button
        type="button"
        aria-label={t.redo}
        title={t.redo}
        data-testid="tool-redo"
        disabled={state.future.length === 0}
        onClick={() => dispatch({ t: 'redo' })}
        className={cell(false, state.future.length === 0)}
      >
        <IconRedo />
      </button>
      <button
        type="button"
        aria-label={t.clear}
        title={t.clear}
        data-testid="tool-clear"
        onClick={() => dispatch({ t: 'clear' })}
        className={cell(false)}
      >
        <IconTrash />
      </button>
    </div>
  );
}
