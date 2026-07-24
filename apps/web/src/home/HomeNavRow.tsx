import type { ReactNode } from 'react';

interface BaseProps {
  readonly children: ReactNode;
  readonly testId?: string;
  readonly title?: string;
}

interface LinkProps extends BaseProps {
  readonly href: string;
  readonly onClick?: undefined;
}

interface ButtonProps extends BaseProps {
  readonly href?: undefined;
  readonly onClick: () => void;
}

const ROW_CLASS =
  'flex w-full items-center gap-[0.7em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.8em] py-[0.55em] text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) hover:bg-(--color-ap-panel-hover)';

/**
 * The full-width icon+label+trailing-glyph panel row idiom shared by
 * LevelBadge (an `<a href="#journey">`, so it's a real navigation link) and
 * Home's "Your corner" button (a `<button>`, since it only flips the hash
 * imperatively). Content is fully caller-supplied — this only owns the row
 * shell + the link/button polymorphism. Preserve exact testids/roles at call
 * sites; e2e depends on them (`level-badge` in particular).
 */
export function HomeNavRow(props: LinkProps | ButtonProps) {
  if (props.href !== undefined) {
    return (
      <a href={props.href} data-testid={props.testId} title={props.title} className={ROW_CLASS}>
        {props.children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={props.testId}
      title={props.title}
      className={ROW_CLASS}
    >
      {props.children}
    </button>
  );
}
