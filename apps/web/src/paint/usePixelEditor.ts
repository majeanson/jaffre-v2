/** React glue over the pure editor reducer. */
import { useReducer } from 'react';
import { editorReducer, initEditor, type EditorState, type EditorAction } from './editor.js';
import type { Grid } from './model.js';

export function usePixelEditor(
  initialGrid: Grid,
  initialColor: string,
): [EditorState, React.Dispatch<EditorAction>] {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initEditor(initialGrid, initialColor),
  );
  return [state, dispatch];
}
