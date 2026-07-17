import type { Action, BidChoice, Card, SeatView, Suit } from '@jaffre/engine';
import { legalCards, teamOf } from '@jaffre/engine';
import { cheapestWinner, isBoss, isBrownZero, isRedZero, trickCtx, wouldWin } from './analysis.js';
import { bestTrump, pickBid } from './evaluate.js';
import { heuristicCard } from './heuristics.js';

/**
 * The Coach: the bot brain turned inside-out. It recommends the strongest move
 * for whoever is on turn and, crucially, says *why* in one plain sentence —
 * the same reasoning the Hard bot uses, surfaced for a human learning the game.
 */
export interface Advice {
  /** The full engine action to suggest, or null when it isn't the viewer's turn. */
  readonly action: Action | null;
  /** The recommended card (playing phase) — the UI highlights it in hand. */
  readonly card: Card | null;
  /** The recommended bid (bidding phase). */
  readonly bid: BidChoice | null;
  /** A short, human explanation of the recommendation. */
  readonly tip: string;
}

const NONE: Advice = { action: null, card: null, bid: null, tip: '' };

/** Tip language. Local type — the bots package must not depend on @jaffre/ui. */
export type CoachLang = 'en' | 'fr';

const SUIT_NAME: Record<CoachLang, Record<Suit, string>> = {
  en: { red: 'Red', brown: 'Brown', green: 'Green', blue: 'Blue' },
  fr: { red: 'rouge', brown: 'brun', green: 'vert', blue: 'bleu' },
};

/** "Red 7" in English, "7 rouge" in French. */
function name(card: Card, lang: CoachLang): string {
  return lang === 'fr'
    ? `${card.value} ${SUIT_NAME.fr[card.suit]}`
    : `${SUIT_NAME.en[card.suit]} ${card.value}`;
}

/** Coach always advises at the strongest level — the point is to teach good play. */
const NORNG = () => 0;

export function suggest(view: SeatView, lang: CoachLang = 'en'): Advice {
  if (view.viewer === 'spectator' || view.turn !== view.viewer) return NONE;
  const seat = view.viewer;

  if (view.phase === 'bidding') {
    const bid = pickBid(view, {
      margin: 0.5,
      allowSansAtout: true,
      scoreAware: true,
      partnerOutbidMargin: 2,
    });
    return {
      action: { type: 'place_bid', seat, choice: bid },
      card: null,
      bid,
      tip: bidTip(view, bid, lang),
    };
  }

  if (view.phase === 'playing') {
    const card = heuristicCard(view, NORNG, 'hard');
    return {
      action: { type: 'play_card', seat, card },
      card,
      bid: null,
      tip: playTip(view, card, lang),
    };
  }

  return NONE;
}

function bidTip(view: SeatView, bid: BidChoice, lang: CoachLang): string {
  if (lang === 'fr') {
    if (bid.kind === 'pass') return 'Ta main est mince — passe et joue en défense.';
    const kind = bid.sansAtout
      ? `mise ${bid.value} sans atout — tu as des gagnantes dans chaque couleur`
      : `le ${SUIT_NAME.fr[bestTrump(view.hand).suit]} est ta couleur la plus forte, alors mise ${bid.value}`;
    return `${kind}. Mise seulement ce qu'il te faut — surmiser ne rapporte jamais plus.`;
  }
  if (bid.kind === 'pass') return 'This hand is thin — pass and play defense.';
  const kind = bid.sansAtout
    ? `bid ${bid.value} sans atout — you have winners in every suit`
    : `${SUIT_NAME.en[bestTrump(view.hand).suit]} is your strongest suit, so bid ${bid.value}`;
  return `${kind}. Bid only what you need — overbidding never scores more.`;
}

function playTip(view: SeatView, card: Card, lang: CoachLang): string {
  const seat = view.viewer as 0 | 1 | 2 | 3;
  const ctx = trickCtx(view);
  const declaring = view.contract !== null && teamOf(view.contract.seat) === teamOf(seat);
  const fr = lang === 'fr';
  const n = name(card, lang);

  // Opening lead as declarer — this card names trump.
  if (
    ctx.position === 0 &&
    view.contract !== null &&
    view.contract.seat === seat &&
    !view.trumpDecided
  ) {
    return fr
      ? `Ouvre en ${SUIT_NAME.fr[card.suit]} — ta première carte nomme l'atout, et ouvrir haut commence à faire sortir les leurs.`
      : `Lead ${SUIT_NAME.en[card.suit]} — your first card names it trump, and leading high starts drawing theirs.`;
  }

  if (ctx.position === 0) {
    if (view.trump !== null && card.suit === view.trump && declaring) {
      return fr
        ? `Ouvre atout (${n}) pour vider les atouts des défenseurs.`
        : `Lead trump (${n}) to strip the defenders of theirs.`;
    }
    if (isBoss(card, view, true)) {
      return fr
        ? `Encaisse ton ${n} — rien en jeu ne peut le battre.`
        : `Cash your ${n} — nothing out can beat it.`;
    }
    return fr
      ? `Ouvre bas avec le ${n}; garde tes grosses cartes pour plus tard.`
      : `Lead low with ${n}; save your strong cards for later.`;
  }

  if (ctx.partnerWinning) {
    if (isRedZero(card))
      return fr
        ? 'Ton partenaire a la levée — passe le 0 rouge pour le +5.'
        : 'Your partner has this trick — cash the Red 0 for +5.';
    return fr
      ? `Ton partenaire est en train de gagner — joue le ${n} bas, ne passe pas par-dessus ton propre camp.`
      : `Your partner is winning — play ${n} low and don't overtake your own side.`;
  }

  // An opponent currently leads the trick.
  if (wouldWin(card, view)) {
    if (view.currentTrick.some((p) => isRedZero(p.card))) {
      return fr
        ? `Gagne celle-là avec le ${n} — le 0 rouge dedans vaut +5.`
        : `Win this one with ${n} — the Red 0 in it is worth +5.`;
    }
    const cheap = cheapestWinner(legalCards(view.hand, ctx.ledSuit), view);
    if (cheap !== null && isBoss(cheap, view, true)) {
      return fr
        ? `Prends la levée avec ton ${n} — impossible à battre.`
        : `Take the trick with your ${n} — it can't be beaten.`;
    }
    if (view.trump !== null && card.suit === view.trump && card.suit !== ctx.ledSuit) {
      return fr
        ? `Coupe avec le ${n} pour prendre la levée — tu n'as plus de la couleur demandée.`
        : `Ruff with ${n} to take the trick — you're out of the led suit.`;
    }
    return fr
      ? `Prends-la avec le ${n} — la carte la moins chère qui gagne quand même.`
      : `Take it with ${n} — the cheapest card that still wins.`;
  }

  if (isBrownZero(card))
    return fr
      ? 'Tu ne peux pas gagner celle-là — donne-leur le 0 brun pour le −2.'
      : "You can't win this — dump the Brown 0 on them for −2.";
  if (view.trump !== null && card.suit === view.trump) {
    return fr
      ? `Impossible de gagner à bon compte — garde tes atouts et jette le ${n} seulement s'il n'y a rien d'autre.`
      : `Can't win cheaply — hold your trumps and throw ${n} only if nothing else.`;
  }
  const keepingRedZero = view.hand.some(isRedZero) && !isRedZero(card);
  return keepingRedZero
    ? fr
      ? `Tu ne peux pas gagner — jette le ${n} et garde le 0 rouge pour plus tard.`
      : `You can't win — throw ${n} and keep the Red 0 for later.`
    : fr
      ? `Tu ne peux pas gagner cette levée — jette ta carte la plus faible, le ${n}.`
      : `You can't win this trick — throw your weakest card, ${n}.`;
}
