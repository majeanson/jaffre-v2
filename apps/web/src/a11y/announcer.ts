import type { GameEvent } from '@jaffre/engine';
import type { Lang } from '@jaffre/ui';
import { TEAM_LABELS, teamLabelWithArticle } from '../teams.js';

const SUIT_NAMES: Record<Lang, Record<'red' | 'brown' | 'green' | 'blue', string>> = {
  en: { red: 'red', brown: 'brown', green: 'green', blue: 'blue' },
  fr: { red: 'rouge', brown: 'brun', green: 'vert', blue: 'bleu' },
};

/**
 * Turn a game event into a spoken/logged sentence. Pure — unit-testable and
 * shared by the aria-live announcer and the visible game log.
 */
export function announce(event: GameEvent, names: readonly string[], lang: Lang = 'en'): string {
  const name = (seat: number) =>
    names[seat] ?? (lang === 'fr' ? `Siège ${seat + 1}` : `Seat ${seat + 1}`);
  const suits = SUIT_NAMES[lang];
  switch (event.type) {
    case 'round_started':
      return lang === 'fr'
        ? `Ronde ${event.roundIndex + 1}. ${name(event.dealer)} brasse.`
        : `Round ${event.roundIndex + 1}. ${name(event.dealer)} deals.`;
    case 'bid_placed':
      if (lang === 'fr') {
        return event.choice.kind === 'pass'
          ? `${name(event.seat)} passe.`
          : `${name(event.seat)} mise ${event.choice.value}${event.choice.sansAtout ? ' sans atout' : ''}.`;
      }
      return event.choice.kind === 'pass'
        ? `${name(event.seat)} passes.`
        : `${name(event.seat)} bids ${event.choice.value}${event.choice.sansAtout ? ' sans atout' : ''}.`;
    case 'bidding_won':
      if (lang === 'fr') {
        return `${name(event.contract.seat)} prend le contrat à ${event.contract.value}${
          event.contract.sansAtout ? ' sans atout, mise doublée' : ''
        }${event.contract.forced ? ' — forcé, tout le monde a passé' : ''}.`;
      }
      return `${name(event.contract.seat)} takes the contract at ${event.contract.value}${
        event.contract.sansAtout ? ' sans atout, stake doubled' : ''
      }${event.contract.forced ? ' — forced, everyone passed' : ''}.`;
    case 'trump_set':
      if (lang === 'fr') {
        return event.trump === null
          ? "Pas d'atout cette ronde."
          : `L'atout est ${suits[event.trump]}.`;
      }
      return event.trump === null ? 'No trump this round.' : `Trump is ${suits[event.trump]}.`;
    case 'card_played':
      return lang === 'fr'
        ? `${name(event.seat)} joue le ${event.card.value} ${suits[event.card.suit]}.`
        : `${name(event.seat)} plays ${suits[event.card.suit]} ${event.card.value}.`;
    case 'trick_won': {
      if (lang === 'fr') {
        const extras = event.specials
          .map((s) => (s === 'red_zero' ? 'le zéro rouge, plus cinq' : 'le zéro brun, moins trois'))
          .join(' et ');
        return `${name(event.winner)} prend la levée pour ${event.points} point${
          Math.abs(event.points) === 1 ? '' : 's'
        }${extras ? `, avec ${extras}` : ''}.`;
      }
      const extras = event.specials
        .map((s) => (s === 'red_zero' ? 'the red zero, plus five' : 'the brown zero, minus three'))
        .join(' and ');
      return `${name(event.winner)} takes the trick for ${event.points} point${
        Math.abs(event.points) === 1 ? '' : 's'
      }${extras ? `, with ${extras}` : ''}.`;
    }
    case 'round_scored': {
      const s = event.summary;
      if (lang === 'fr') {
        const team = `L'${TEAM_LABELS.fr[(s.contract.seat % 2) as 0 | 1]}`;
        return `${team} ${s.contractMade ? 'réussit' : 'rate'} ${s.contract.value}${
          s.contract.sansAtout ? ' sans atout' : ''
        }. Pointage : ${TEAM_LABELS.fr[0]} ${s.scores[0]}, ${TEAM_LABELS.fr[1]} ${s.scores[1]}.`;
      }
      const team = TEAM_LABELS.en[(s.contract.seat % 2) as 0 | 1];
      return `${team} ${s.contractMade ? 'makes' : 'fails'} ${s.contract.value}${
        s.contract.sansAtout ? ' sans atout' : ''
      }. Score: ${TEAM_LABELS.en[0]} ${s.scores[0]}, ${TEAM_LABELS.en[1]} ${s.scores[1]}.`;
    }
    case 'game_over':
      return lang === 'fr'
        ? `Partie terminée — ${teamLabelWithArticle(event.winner, 'fr')} gagne!`
        : `Game over — ${TEAM_LABELS.en[event.winner]} wins!`;
  }
}
