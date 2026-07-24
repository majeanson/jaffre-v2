import { useLang, type Lang } from '../i18n.js';
import { ARCADE } from './arcade.js';

const T: Record<
  Lang,
  {
    noVoice: string;
    mutedChip: string;
    joining: string;
    join: string;
    unavailable: string;
    tryAgain: string;
    live: string;
    you: string;
    unmute: string;
    mute: string;
    leave: string;
  }
> = {
  en: {
    noVoice: 'no voice',
    mutedChip: 'muted',
    joining: 'Joining…',
    join: 'Join voice',
    unavailable: 'Voice unavailable — the game continues without it.',
    tryAgain: 'Try again',
    live: 'Live',
    you: 'You',
    unmute: 'Unmute',
    mute: 'Mute',
    leave: 'Leave',
  },
  fr: {
    noVoice: 'pas de vocal',
    mutedChip: 'micro coupé',
    joining: 'Connexion…',
    join: 'Joindre le vocal',
    unavailable: 'Vocal indisponible — la partie continue quand même.',
    tryAgain: 'Réessaie',
    live: 'En direct',
    you: 'Toi',
    unmute: 'Réactiver le micro',
    mute: 'Couper le micro',
    leave: 'Quitter',
  },
};

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
  const t = T[useLang()];
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
      {!connected && <span className="text-(--color-ap-muted)">{t.noVoice}</span>}
      {connected && muted && <span className="text-(--color-ap-muted)">{t.mutedChip}</span>}
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
  const t = T[useLang()];
  if (status === 'idle' || status === 'joining') {
    const joining = status === 'joining';
    return (
      <button
        type="button"
        onClick={onJoin}
        disabled={joining}
        data-testid="voice-join"
        aria-label={joining ? t.joining : t.join}
        title={joining ? t.joining : t.join}
        className={`${ARCADE.iconBtnLabeled} bg-(--color-ap-panel) ${
          joining
            ? 'text-(--color-ap-muted)'
            : 'cursor-pointer text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
        }`}
      >
        {/* microphone */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[1.2em] shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
        </svg>
        <span className="whitespace-nowrap text-[11px]">{joining ? t.joining : t.join}</span>
      </button>
    );
  }

  if (status === 'error') {
    return (
      <p
        data-testid="voice-error"
        className="flex max-w-52 flex-wrap items-center gap-2 text-[11px] text-(--color-ap-danger-text)"
      >
        {errorMessage ?? t.unavailable}
        <button
          type="button"
          onClick={onJoin}
          data-testid="voice-retry"
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-danger) px-2 py-0.5 text-[11px] text-(--color-ap-danger-text) hover:bg-(--color-ap-panel-hover)"
        >
          {t.tryAgain}
        </button>
      </p>
    );
  }

  return (
    <div
      data-testid="voice-bar"
      className={`${ARCADE.panel} flex flex-wrap items-center gap-1.5 px-2 py-1.5`}
    >
      <span
        data-testid="voice-live"
        className="text-[10px] font-semibold uppercase tracking-widest text-(--color-ap-ok)"
      >
        {t.live}
      </span>
      <Chip name={t.you} connected muted={muted} speaking={speaking && !muted} />
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
        {muted ? t.unmute : t.mute}
      </button>
      <button
        type="button"
        onClick={onLeave}
        data-testid="voice-leave"
        className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2 py-1 text-[11px] text-(--color-ap-text) hover:bg-(--color-ap-panel-hover) cursor-pointer"
      >
        {t.leave}
      </button>
    </div>
  );
}
