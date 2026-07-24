import type { SeatView } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import type { ScoreboardRound } from '@jaffre/ui';
import { getProfile } from '../net/auth.js';
import { botAvatar } from '../paint/botAvatars.js';
import { GameRecap } from './GameRecap.js';
import { RoundSummaryOverlay } from './RoundSummaryOverlay.js';
import { teamSpecialsFrom } from './specials.js';

export interface OverlaysProps {
  readonly view: SeatView;
  readonly roster: Roster;
  /** Your absolute seat, or null when spectating. */
  readonly me: number | null;
  /** Finished rounds for the round summary's written scoresheet. */
  readonly rounds: readonly ScoreboardRound[];
  /** Declare readiness for the next round. */
  readonly onReady: () => void;
  readonly onRematch?: (() => void) | undefined;
  readonly onSwapSeats?: (() => void) | undefined;
  readonly onLeave: () => void;
}

/** Owns the modal layer: round summary between rounds, game recap at the end. */
export function Overlays({
  view,
  roster,
  me,
  rounds,
  onReady,
  onRematch,
  onSwapSeats,
  onLeave,
}: OverlaysProps) {
  const readySeats = roster.seats.map((s) => s?.ready ?? s?.isBot ?? false);
  return (
    <>
      {view.phase === 'round_over' && view.lastRoundSummary !== null && (
        <RoundSummaryOverlay
          summary={view.lastRoundSummary}
          contractName={roster.seats[view.lastRoundSummary.contract.seat]?.name ?? 'Player'}
          names={roster.seats.map((s) => s?.name ?? '—')}
          specials={teamSpecialsFrom(view.capturedTricks)}
          readySeats={readySeats}
          youReady={me !== null ? (readySeats[me] ?? false) : true}
          onReady={onReady}
          rounds={rounds}
          summaries={view.roundSummaries}
          myTeam={me !== null ? ((me % 2) as 0 | 1) : null}
        />
      )}
      {view.phase === 'game_over' && (
        <GameRecap
          winner={view.winner as 0 | 1}
          scores={view.scores}
          rounds={view.roundSummaries}
          names={roster.seats.map((s) => s?.name ?? '—')}
          seats={roster.seats}
          seriesWins={roster.seriesWins}
          seriesGames={roster.seriesGames}
          seriesTricks={roster.seriesTricks}
          mySeat={me}
          // Same per-seat art as the felt: bot sprites, your own painting;
          // other humans stay on their initial (the roster carries no paint).
          avatars={roster.seats.map((s, i) =>
            s?.isBot === true ? botAvatar(i) : i === me ? getProfile().paint : null,
          )}
          myRating={roster.ratings?.find((r) => r.seat === me)}
          endReason={view.endReason}
          showXp={me !== null}
          onRematch={onRematch}
          onSwapSeats={onSwapSeats}
          onLeave={onLeave}
        />
      )}
    </>
  );
}
