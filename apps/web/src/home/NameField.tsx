import type { CSSProperties } from 'react';

export interface NameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Persist the (trimmed) name — called on blur. */
  readonly onCommit: () => void;
}

/** Compact identity pill: who you are at every table you join. */
export function NameField({ value, onChange, onCommit }: NameFieldProps) {
  return (
    <label
      className="rise-in flex w-full max-w-xs items-center gap-3 rounded-full border border-white/12 bg-black/25 px-4 py-2 focus-within:border-(--color-accent)"
      style={{ '--rise-delay': '20ms' } as CSSProperties}
    >
      <span className="shrink-0 text-[11px] font-semibold tracking-[0.14em] uppercase text-(--color-ivory)/55">
        Your name
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        maxLength={20}
        placeholder="Player"
        className="min-w-0 flex-1 bg-transparent text-(--color-ivory) outline-none placeholder:text-(--color-ivory)/30"
      />
    </label>
  );
}
