import type { GameEvent } from '@jaffre/engine';

const SUIT_NAMES = { red: 'red', brown: 'brown', green: 'green', blue: 'blue' } as const;

/**
 * Turn a game event into a spoken/logged sentence. Pure — unit-testable and
 * shared by the aria-live announcer and the visible game log.
 */
export function announce(event: GameEvent, names: readonly string[]): string {
  const name = (seat: number) => names[seat] ?? `Seat ${seat + 1}`;
  switch (event.type) {
    case 'round_started':
      return `Round ${event.roundIndex + 1}. ${name(event.dealer)} deals.`;
    case 'bid_placed':
      return event.choice.kind === 'pass'
        ? `${name(event.seat)} passes.`
        : `${name(event.seat)} bids ${event.choice.value}${event.choice.sansAtout ? ' sans atout' : ''}.`;
    case 'bidding_won':
      return `${name(event.contract.seat)} takes the contract at ${event.contract.value}${
        event.contract.sansAtout ? ' sans atout, stake doubled' : ''
      }${event.contract.forced ? ' — forced, everyone passed' : ''}.`;
    case 'trump_set':
      return event.trump === null ? 'No trump this round.' : `Trump is ${SUIT_NAMES[event.trump]}.`;
    case 'card_played':
      return `${name(event.seat)} plays ${SUIT_NAMES[event.card.suit]} ${event.card.value}.`;
    case 'trick_won': {
      const extras = event.specials
        .map((s) => (s === 'red_zero' ? 'the red zero, plus five' : 'the brown zero, minus two'))
        .join(' and ');
      return `${name(event.winner)} takes the trick for ${event.points} point${
        Math.abs(event.points) === 1 ? '' : 's'
      }${extras ? `, with ${extras}` : ''}.`;
    }
    case 'round_scored': {
      const s = event.summary;
      const team = s.contract.seat % 2 === 0 ? 'Team A' : 'Team B';
      return `${team} ${s.contractMade ? 'makes' : 'fails'} ${s.contract.value}${
        s.contract.sansAtout ? ' sans atout' : ''
      }. Score: Team A ${s.scores[0]}, Team B ${s.scores[1]}.`;
    }
    case 'game_over':
      return `Game over — ${event.winner === 0 ? 'Team A' : 'Team B'} wins!`;
  }
}
