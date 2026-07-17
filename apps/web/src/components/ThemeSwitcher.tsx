import { useState } from 'react';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

/** Skin picker — themes are pure token swaps, safe to change mid-game. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  return (
    <label className="flex items-center gap-1.5 font-arcade-ui text-xs text-(--color-ap-muted)">
      <span className="max-sm:sr-only">Skin</span>
      {/* appearance-none so the select honors our background-color: the native
          widget paints a system bg that axe samples (mis-flagging the ivory
          text over the felt gradient). A custom caret replaces the native one. */}
      <span className="relative inline-flex items-center">
        <select
          aria-label="Skin"
          value={theme}
          onChange={(e) => {
            const next = e.target.value as ThemeId;
            applyTheme(next);
            setTheme(next);
          }}
          className="cursor-pointer appearance-none rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) py-1.5 pr-6 pl-2 font-arcade-ui text-xs text-(--color-ap-text) shadow-(--shadow-ap-sm)"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 text-[8px] text-(--color-ap-muted)"
        >
          ▼
        </span>
      </span>
    </label>
  );
}
