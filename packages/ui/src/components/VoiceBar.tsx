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
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] transition-shadow duration-(--duration-flick) ${
        speaking && connected
          ? 'border-(--color-ap-violet) text-(--color-ap-text) ring-2 ring-(--color-ap-violet)'
          : 'border-(--color-ap-ink) text-(--color-ap-muted)'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${connected ? 'bg-(--color-ap-ok)' : 'bg-(--color-ap-danger)'}`}
      />
      {name}
      {!connected && <span className="text-(--color-ap-muted)">no voice</span>}
      {connected && muted && <span className="text-(--color-ap-muted)">muted</span>}
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
        className={`rounded-(--radius-ap-control) border-2 px-3 py-2 text-xs ${
          status === 'joining'
            ? 'border-(--color-ap-ink) text-(--color-ap-muted)'
            : 'border-(--color-ap-ink) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover) cursor-pointer'
        }`}
      >
        {status === 'joining' ? 'Joining…' : 'Join voice'}
      </button>
    );
  }

  if (status === 'error') {
    return (
      <p data-testid="voice-error" className="max-w-52 text-[11px] text-(--color-ap-danger-text)">
        {errorMessage ?? 'Voice unavailable — the game continues without it.'}
      </p>
    );
  }

  return (
    <div
      data-testid="voice-bar"
      className="flex flex-wrap items-center gap-1.5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) px-2 py-1.5"
    >
      <span
        data-testid="voice-live"
        className="text-[10px] font-semibold uppercase tracking-widest text-(--color-ap-ok)"
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
        className={`rounded-(--radius-ap-control) border-2 px-2 py-1 text-[11px] cursor-pointer ${
          muted
            ? 'border-(--color-ap-danger) text-(--color-ap-danger-text)'
            : 'border-(--color-ap-ink) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
        }`}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        onClick={onLeave}
        data-testid="voice-leave"
        className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2 py-1 text-[11px] text-(--color-ap-text) hover:bg-(--color-ap-panel-hover) cursor-pointer"
      >
        Leave
      </button>
    </div>
  );
}
