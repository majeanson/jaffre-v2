import type { Action, BidChoice, Card, SeatView, Suit } from '@jaffre/engine';
import { SUITS, legalCards, teamOf } from '@jaffre/engine';
import {
  certainRedZeroRuff,
  cheapestWinner,
  isBoss,
  isBrownZero,
  isRedZero,
  lowestEquivalent,
  redZeroLive,
  trickCtx,
  tricksPlayed,
  wouldWin,
} from './analysis.js';
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
  // Dealer facing three passes: passing here IS bidding 7 — say so.
  const dealerForced =
    bid.kind === 'pass' &&
    view.viewer === view.dealer &&
    view.bids.length === 3 &&
    view.bids.every((b) => b.choice.kind === 'pass');
  if (dealerForced) {
    return lang === 'fr'
      ? 'Trois passes — passer te force à 7. Prépare-toi : ta plus longue couleur comme atout, ton partenaire en renfort, et le 0 brun sorti au plus vite.'
      : 'Three passes — passing puts the forced 7 on you. Plan for it: longest suit as trump, lean on your partner, and get the brown 0 out early.';
  }
  // Read the dealt hand so the recommendation rests on concrete, qualitative
  // facts (never percentages — a product decision). All facts derive from
  // view.hand; nothing is hardcoded.
  const fr = lang === 'fr';
  const hasRed0 = view.hand.some(isRedZero);
  const hasBrown0 = view.hand.some(isBrownZero);
  // A dealt void is worth naming the moment it can cash the +5: red trump plus
  // no cards in some suit means the red 0 ruffs that suit and wins its own
  // trick. Nothing else in a thin hand is worth 6 points.
  const voidSuit = SUITS.find((s) => !view.hand.some((c) => c.suit === s)) ?? null;
  const voidName =
    voidSuit === null ? '' : fr ? SUIT_NAME.fr[voidSuit] : SUIT_NAME.en[voidSuit].toLowerCase();

  // The +5 / −3 zeros, tucked onto the plan as a single short tail.
  const assetTail = hasRed0
    ? fr
      ? ', et le 0 rouge te vaut +5'
      : ', and the red 0 banks +5'
    : hasBrown0
      ? fr
        ? ', et refile le 0 brun (−3) au plus vite'
        : ', and shed the brown 0 (−3) early'
      : '';

  if (bid.kind === 'pass') {
    const longest = Math.max(...SUITS.map((s) => view.hand.filter((c) => c.suit === s).length));
    const passTail = hasRed0
      ? voidSuit !== null
        ? fr
          ? `, mais garde le 0 rouge : si le rouge devient atout, ta chute en ${voidName} le fait couper pour +5`
          : `, but hold the red 0: if red comes up trump, your ${voidName} void lets it ruff for +5`
        : fr
          ? ', mais garde le 0 rouge pour son +5'
          : ', but keep the red 0 safe for its +5'
      : hasBrown0
        ? fr
          ? ', et cherche à te débarrasser du 0 brun'
          : ', and look to unload the brown 0'
        : '';
    return fr
      ? `Main mince — ta plus longue couleur ne fait que ${longest} et tu manques de grosses cartes. Passe et défends${passTail}.`
      : `Thin hand — your longest suit is only ${longest} and you're short of top cards. Pass and defend${passTail}.`;
  }

  if (bid.sansAtout) {
    return fr
      ? `Des gagnantes dans chaque couleur — mise ${bid.value} sans atout. Sans atout, chaque 7 que tu tiens est une levée sûre${assetTail}.`
      : `Winners in every suit — bid ${bid.value} sans atout. With no trump, every 7 you hold is a sure trick${assetTail}.`;
  }

  // Trump bid: describe how strong the chosen suit actually is.
  const suit = bestTrump(view.hand).suit;
  // Naming red yourself is the strongest form of holding the +5: you pick the
  // trump that makes your own red 0 — otherwise the worst card in the deck —
  // win the first trick led in the suit you're void in.
  const assetTailForTrump =
    hasRed0 && suit === 'red' && voidSuit !== null
      ? fr
        ? `, et le rouge comme atout fait de ton 0 rouge une coupe gagnante en ${voidName} : +5`
        : `, and red trump turns your red 0 into a winning ${voidName} ruff for +5`
      : assetTail;
  const shape = suitShape(view.hand, suit);
  const suitName = fr ? SUIT_NAME.fr[suit] : SUIT_NAME.en[suit].toLowerCase();
  const plural = shape.count === 1 ? '' : 's';

  // Sure-winner note — accurate to the engine: the 7 of the TRUMP suit always
  // wins, and a run from the top (7-6-5…) is that many sure tricks.
  let topNote: string;
  if (shape.runFromTop >= 3) {
    topNote = fr ? `, dont une suite 7-6-5 de levées sûres` : `, incl. a 7-6-5 run of sure tricks`;
  } else if (shape.runFromTop === 2) {
    topNote = fr
      ? ` dont le 7 et le 6 — deux levées sûres`
      : ` incl. the 7 and 6 — two sure tricks`;
  } else if (shape.holds7) {
    topNote = fr
      ? ` dont le 7, qui gagne toujours comme atout`
      : ` incl. the 7, which always wins as trump`;
  } else if (shape.count >= 4) {
    topNote = fr ? ` — tu contrôles la couleur` : ` — that's control of the suit`;
  } else {
    topNote = '';
  }

  return fr
    ? `Tu as ${shape.count} ${suitName}${plural}${topNote}. Prends le ${suitName} comme atout; une mise de ${bid.value} passe bien ici${assetTailForTrump}.`
    : `You hold ${shape.count} ${suitName}${plural}${topNote}. Lean ${suitName} trump; a bid of ${bid.value} is safe here${assetTailForTrump}.`;
}

/** One suit's shape in hand: how many held, whether the 7 is there, and the length of the run down from the 7 (7-6-5…). */
function suitShape(
  hand: readonly Card[],
  suit: Suit,
): { count: number; holds7: boolean; runFromTop: number } {
  const vals = hand.filter((c) => c.suit === suit).map((c) => c.value as number);
  let runFromTop = 0;
  for (let v = 7; v >= 0 && vals.includes(v); v--) runFromTop += 1;
  return { count: vals.length, holds7: vals.includes(7), runFromTop };
}

function playTip(view: SeatView, card: Card, lang: CoachLang): string {
  const seat = view.viewer as 0 | 1 | 2 | 3;
  const ctx = trickCtx(view);
  const declaring = view.contract !== null && teamOf(view.contract.seat) === teamOf(seat);
  const fr = lang === 'fr';
  const n = name(card, lang);

  // The red-0 ruff. Checked first because it reads as a blunder to a learner —
  // the +5 thrown on a trick nobody has won yet — and it is the strongest card
  // on the table: the lowest trump in the deck beats every plain card, so the
  // bonus wins its own trick. The bot only picks it when no over-ruff is left
  // (certainRedZeroRuff), and the tip has to say so, or a player will copy it
  // into a trick where the 6 points get taken off them.
  if (isRedZero(card) && ctx.ledSuit !== null && certainRedZeroRuff(view, [card]) !== null) {
    const led = fr ? SUIT_NAME.fr[ctx.ledSuit] : SUIT_NAME.en[ctx.ledSuit].toLowerCase();
    return fr
      ? `Coupe avec le ${n} — même ton plus petit atout prend la levée en ${led}, et il encaisse son propre +5 : 6 points, sans surcoupe possible.`
      : `Ruff with the ${n} — even your weakest trump takes a ${led} trick, and it banks its own +5: 6 points, with no over-ruff left behind you.`;
  }

  // Opening lead as declarer — this card names trump.
  if (
    ctx.position === 0 &&
    view.contract !== null &&
    view.contract.seat === seat &&
    !view.trumpDecided
  ) {
    if (view.contract.forced) {
      return fr
        ? `Forcé à 7 — nomme ta plus longue couleur comme atout (${SUIT_NAME.fr[card.suit]}), appuie-toi sur ton partenaire et refile le 0 brun sur leurs levées.`
        : `Forced to 7 — name your longest suit trump (${SUIT_NAME.en[card.suit]}), lean on your partner, and dump the brown 0 on their tricks.`;
    }
    return fr
      ? `Entame en ${SUIT_NAME.fr[card.suit]} — ta première carte nomme l'atout, et entamer haut commence à faire sortir les leurs.`
      : `Lead ${SUIT_NAME.en[card.suit]} — your first card names it trump, and leading high starts drawing theirs.`;
  }

  if (ctx.position === 0) {
    if (view.trump !== null && card.suit === view.trump && declaring) {
      return fr
        ? `Entame atout (${n}) pour vider les atouts des défenseurs.`
        : `Lead trump (${n}) to strip the defenders of theirs.`;
    }
    if (isBoss(card, view, true)) {
      // Leading red from strength while the +5 is still out forces the red 0
      // to follow — it falls under our winner.
      if (card.suit === 'red' && redZeroLive(view) && !isRedZero(card)) {
        return fr
          ? `Entame rouge avec ton ${n} — le 0 rouge est encore en jeu, et celui qui le tient doit fournir : il peut tomber sous ta gagnante pour +5.`
          : `Lead red with your ${n} — the Red 0 is still out, and whoever holds it must follow: it can fall under your winner for +5.`;
      }
      if (concealedBy(card, view)) {
        return fr
          ? `Encaisse avec le ${n} — il gagne les mêmes levées que tes plus hautes et ne dit rien à la table.`
          : `Cash with ${n} — it wins the same tricks as your higher cards and tells the table nothing.`;
      }
      return fr
        ? `Encaisse ton ${n} — rien en jeu ne peut le battre.`
        : `Cash your ${n} — nothing out can beat it.`;
    }
    return fr
      ? `Entame petit avec le ${n}; garde tes grosses cartes pour plus tard.`
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
      if (concealedBy(card, view)) {
        return fr
          ? `Gagne avec le ${n} — la plus petite de tes égales prend la même levée sans montrer ton jeu.`
          : `Win with ${n} — the lowest of your equals takes the same trick without showing your hand.`;
      }
      return fr
        ? `Prends la levée avec ton ${n} — impossible à battre.`
        : `Take the trick with your ${n} — it can't be beaten.`;
    }
    if (view.trump !== null && card.suit === view.trump && card.suit !== ctx.ledSuit) {
      return fr
        ? `Coupe avec le ${n} pour prendre la levée — tu n'as plus la couleur demandée.`
        : `Ruff with ${n} to take the trick — you're out of the led suit.`;
    }
    return fr
      ? `Prends-la avec le ${n} — la carte la moins chère qui gagne quand même.`
      : `Take it with ${n} — the cheapest card that still wins.`;
  }

  if (isBrownZero(card))
    return fr
      ? 'Tu ne peux pas gagner celle-là — donne-leur le 0 brun pour le −3.'
      : "You can't win this — dump the Brown 0 on them for −3.";

  // Ducking with the low brown while the −3 is still ours: the escape card.
  if (card.suit === 'brown' && !isBrownZero(card) && view.hand.some(isBrownZero)) {
    return fr
      ? `Fournis le ${n} et perds la levée — ne gagne jamais celle où ton 0 brun devra atterrir.`
      : `Duck with ${n} — never win the trick your Brown 0 has to leave in.`;
  }
  if (view.trump !== null && card.suit === view.trump) {
    return fr
      ? `Pas moyen de gagner à bon compte — garde tes atouts et ne jette le ${n} que s'il n'y a rien d'autre.`
      : `Can't win cheaply — hold your trumps and throw ${n} only if nothing else.`;
  }

  // Sloughing the last card of a side suit: a void is a future ruff.
  const lastOfSuit = view.hand.filter((h) => h.suit === card.suit).length === 1;
  const holdsTrump = view.trump !== null && view.hand.some((h) => h.suit === view.trump);
  if (
    lastOfSuit &&
    holdsTrump &&
    card.suit !== view.trump &&
    !isRedZero(card) &&
    tricksPlayed(view) <= 3
  ) {
    const redNote = redZeroLive(view) && card.suit !== 'red';
    return fr
      ? `Jette ton dernier ${SUIT_NAME.fr[card.suit]} — une chute là te permet de couper ensuite${redNote ? ', et le 0 rouge est encore en jeu' : ''}.`
      : `Throw your last ${SUIT_NAME.en[card.suit]} — a void there lets you ruff later${redNote ? ', and the Red 0 is still out' : ''}.`;
  }

  const keepingRedZero = view.hand.some(isRedZero) && !isRedZero(card);
  if (keepingRedZero) {
    return fr
      ? `Tu ne peux pas gagner — jette le ${n} et garde le 0 rouge pour plus tard.`
      : `You can't win — throw ${n} and keep the Red 0 for later.`;
  }
  const redWatch = redZeroLive(view) && card.suit !== 'red';
  return fr
    ? `Tu ne peux pas gagner cette levée — jette ta carte la plus faible, le ${n}.${redWatch ? ' Le 0 rouge est encore en jeu — garde de quoi gagner une levée rouge.' : ''}`
    : `You can't win this trick — throw your weakest card, ${n}.${redWatch ? ' The Red 0 is still out — keep a way to win a red trick.' : ''}`;
}

/** True when `card` is the low end of a run of equals — the concealment play. */
function concealedBy(card: Card, view: SeatView): boolean {
  const pool = view.hand.filter((h) => h.suit === card.suit);
  return (
    pool.some((h) => h.value > card.value) &&
    lowestEquivalent(pool.sort((a, b) => b.value - a.value)[0] as Card, pool, view).value ===
      card.value
  );
}
