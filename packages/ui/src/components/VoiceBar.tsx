export type VoiceStatus = 'idle' | 'joining' | 'live' | 'error';

export interface VoicePeerChip {
  readonly name: string;
  /** False while the P2P link is down — shown as "no voice". */
  readonly connected: boolean;
  readonly muted: boolean;
  readonly speaking: boolean;
}

export interface VoiceBarProps {
  readonly status: VoiceStatus;
  readonly errorMessage?: string;
  /** The other seated humans (bots never appear here). */
  readonly peers: readonly VoicePeerChip[];
  readonly muted: boolean;
  readonly speaking: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onToggleMute: () => void;
}

function Chip({ name, connected, muted, speaking }: VoicePeerChip) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-shadow duration-(--duration-flick) ${
        speaking && connected
          ? 'border-(--color-lamplight) text-(--color-ivory) shadow-[0_0_8px_var(--color-lamplight)]'
          : 'border-white/12 text-(--color-ivory)/70'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${connected ? 'bg-(--color-ok)' : 'bg-(--color-danger)'}`}
      />
      {name}
      {!connected && <span className="text-(--color-ivory)/40">no voice</span>}
      {connected && muted && <span title="Muted">🔇</span>}
    </span>
  );
}

/** Voice chat controls: join, per-player chips with speaking glow, mute/leave. */
export function VoiceBar({
  status,
  errorMessage,
  peers,
  muted,
  speaking,
  onJoin,
  onLeave,
  onToggleMute,
}: VoiceBarProps) {
  if (status === 'idle' || status === 'joining') {
    return (
      <button
        type="button"
        onClick={onJoin}
        disabled={status === 'joining'}
        data-testid="voice-join"
        className={`rounded-lg border px-3 py-2 text-xs ${
          status === 'joining'
            ? 'border-white/8 text-(--color-ivory)/40'
            : 'border-white/15 text-(--color-ivory)/75 hover:bg-white/8 cursor-pointer'
        }`}
      >
        {status === 'joining' ? 'Joining…' : '🎙 Join voice'}
      </button>
    );
  }

  if (status === 'error') {
    return (
      <p data-testid="voice-error" className="max-w-52 text-[11px] text-(--color-danger)/90">
        {errorMessage ?? 'Voice unavailable — the game continues without it.'}
      </p>
    );
  }

  return (
    <div
      data-testid="voice-bar"
      className="flex flex-wrap items-center gap-1.5 rounded-(--radius-panel) border border-white/8 bg-black/25 px-2 py-1.5"
    >
      <span
        data-testid="voice-live"
        className="text-[10px] font-semibold uppercase tracking-widest text-(--color-ok)"
      >
        Live
      </span>
      <Chip name="You" connected muted={muted} speaking={speaking && !muted} />
      {peers.map((p, i) => (
        <Chip key={i} {...p} />
      ))}
      <button
        type="button"
        onClick={onToggleMute}
        data-testid="voice-mute"
        className={`rounded-lg border px-2 py-1 text-[11px] cursor-pointer ${
          muted
            ? 'border-(--color-danger)/60 text-(--color-danger)'
            : 'border-white/15 text-(--color-ivory)/75 hover:bg-white/8'
        }`}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        onClick={onLeave}
        data-testid="voice-leave"
        className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-(--color-ivory)/75 hover:bg-white/8 cursor-pointer"
      >
        Leave
      </button>
    </div>
  );
}
