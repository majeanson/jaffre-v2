import { AvatarChip, Cta } from '@jaffre/ui';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';

export interface MetaHeaderProps {
  readonly title: string;
  readonly homeLabel: string;
  readonly onLeave: () => void;
}

/**
 * The AvatarChip + h1 + Home Cta row shared by every "Your corner" meta
 * screen (Corner, Journey, Awards, Stats, Collection, Leaderboard) — one
 * rule: the avatar shows on ALL of them. Each screen keeps its own exact h1
 * text and onLeave behavior (PublicLobby keeps its own header, unrelated
 * workstream).
 */
export function MetaHeader({ title, homeLabel, onLeave }: MetaHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-[0.5em]">
        <AvatarChip name={playerName()} color={getProfile().color ?? undefined} size="sm" />
        <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
          {title}
        </h1>
      </div>
      <Cta variant="secondary" onClick={onLeave}>
        {homeLabel}
      </Cta>
    </header>
  );
}
