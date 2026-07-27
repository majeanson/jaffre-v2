import type { SeatView } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import type { ScoreboardRound } from '@jaffre/ui';
import { useEffect } from 'react';
import { getProfile } from '../net/auth.js';
import { reportFunnel } from '../net/telemetry.js';
import { botAvatar } from '../paint/botAvatars.js';
import { useGameStore } from '../state/gameStore.js';
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
  /** Online rooms: the recap's leave is permanent (seat freed) — two-tap it. */
  readonly confirmLeave?: boolean;
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
  confirmLeave = false,
}: OverlaysProps) {
  const readySeats = roster.seats.map((s) => s?.ready ?? s?.isBot ?? false);
  // The round/game modal waits for the final trick's held moment (banner +
  // face-up cards, ~2.2s) to finish: it used to pop instantly over the hold,
  // stealing the RED 0! beat and leaving a card corner poking past the
  // modal's dim (2nd visual sweep). Scenes freeze the hold, so their summary
  // scenes stage `round_over` without a held trick and still render.
  const heldTrick = useGameStore((s) => s.heldTrick);
  // The funnel's last step: a first game actually played to the end.
  const over = view.phase === 'game_over';
  useEffect(() => {
    if (over) reportFunnel('finish');
  }, [over]);
  return (
    <>
      {heldTrick === null && view.phase === 'round_over' && view.lastRoundSummary !== null && (
        <RoundSummaryOverlay
          summary={view.lastRoundSummary}
          contractName={roster.seats[view.lastRoundSummary.contract.seat]?.name ?? 'Player'}
          names={roster.seats.map((s) => s?.name ?? '—')}
          specials={teamSpecialsFrom(view.capturedTricks)}
          readySeats={readySeats}
          youReady={me !== null ? (readySeats[me] ?? false) : true}
          readyTimeoutAt={roster.readyTimeoutAt ?? null}
          onReady={onReady}
          rounds={rounds}
          summaries={view.roundSummaries}
          myTeam={me !== null ? ((me % 2) as 0 | 1) : null}
        />
      )}
      {heldTrick === null && view.phase === 'game_over' && (
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
          // Same per-seat art as the felt: bot sprites, your own painting
          // (local copy is freshest), other humans' paint from the roster.
          avatars={roster.seats.map((s, i) =>
            s?.isBot === true ? botAvatar(i) : i === me ? getProfile().paint : (s?.paint ?? null),
          )}
          myRating={roster.ratings?.find((r) => r.seat === me)}
          endReason={view.endReason}
          showXp={me !== null}
          onRematch={onRematch}
          onSwapSeats={onSwapSeats}
          onLeave={onLeave}
          confirmLeave={confirmLeave}
        />
      )}
    </>
  );
}
