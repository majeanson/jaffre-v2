export interface NameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Persist the (trimmed) name — called on blur. */
  readonly onCommit: () => void;
  /** Error to surface under the field (e.g. a taken name) — arcade danger. */
  readonly error?: string | null;
}

/** Compact identity pill in the arcade shell: who you are at every table you
 * join. Ink border + hard shadow, uppercase display label, Rubik input. */
export function NameField({ value, onChange, onCommit, error = null }: NameFieldProps) {
  const invalid = error !== null;
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-[0.4em]">
      <label
        className={`flex w-full items-center gap-3 rounded-(--radius-ap-control) border-2 bg-(--color-ap-panel) px-4 py-[0.6em] font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-sm) focus-within:bg-(--color-ap-panel-hover) ${
          invalid ? 'border-(--color-ap-danger)' : 'border-(--color-ap-ink)'
        }`}
      >
        <span className="shrink-0 font-arcade-display text-[0.85em] uppercase tracking-[0.12em] text-(--color-ap-muted)">
          Your name
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          maxLength={20}
          placeholder="Player"
          aria-invalid={invalid}
          className="min-w-0 flex-1 bg-transparent tabular-nums text-(--color-ap-text) outline-none placeholder:text-(--color-ap-muted)"
        />
      </label>
      {invalid && (
        <p role="alert" className="font-arcade-ui text-[0.8em] text-(--color-ap-danger-text)">
          {error}
        </p>
      )}
    </div>
  );
}
