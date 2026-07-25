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
    <header className="flex items-center justify-between gap-4 max-sm:gap-2">
      {/* min-w-0 + phone type scale: long titles (COLLECTION, LEADERBOARD) were
          pushing the Home Cta off the 390px viewport's right edge. */}
      <div className="flex min-w-0 items-center gap-[0.5em]">
        <AvatarChip name={playerName()} color={getProfile().color ?? undefined} size="sm" />
        <h1 className="min-w-0 break-words font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold) max-sm:text-[1.5em]">
          {title}
        </h1>
      </div>
      <Cta variant="secondary" className="shrink-0" onClick={onLeave}>
        {homeLabel}
      </Cta>
    </header>
  );
}
