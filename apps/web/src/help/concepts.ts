import type { Lang } from '@jaffre/ui';

/**
 * The concept glossary. Every concept belongs to a color family — the two
 * bonhommes wear their suit colors, trick concepts are gold, trump concepts
 * green, auction concepts blue — and inline mentions link to the entry
 * wiki-style, with cross-references between related entries.
 */
export type ConceptId =
  | 'red0'
  | 'brown0'
  | 'levee'
  | 'maitre'
  | 'atout'
  | 'coupe'
  | 'chute'
  | 'mise'
  | 'sansatout'
  | 'hailmary'
  | 'brasseur';

export interface Concept {
  readonly color: string;
  readonly term: Record<Lang, string>;
  readonly def: Record<Lang, string>;
  readonly see: readonly ConceptId[];
}

const GOLD = 'var(--color-ap-gold)';
const RED = 'var(--color-suit-red)';
const BROWN = 'var(--color-suit-brown)';
const GREEN = 'var(--color-suit-green)';
const BLUE = 'var(--color-suit-blue)';

export const CONCEPTS: Record<ConceptId, Concept> = {
  red0: {
    color: RED,
    term: { en: 'The red 0 (joffre)', fr: 'Le 0 rouge (joffre)' },
    def: {
      en: 'The +5 bonhomme: whoever wins the trick it lands in scores 5 extra points — that trick is worth 6 in total, the biggest prize of the round.',
      fr: "Le bonhomme à +5 : l'équipe qui gagne la levée où il tombe marque 5 points de plus — cette levée-là vaut 6 au total, le plus gros lot de la ronde.",
    },
    see: ['brown0', 'levee', 'maitre'],
  },
  brown0: {
    color: BROWN,
    term: { en: 'The brown 0', fr: 'Le 0 brun' },
    def: {
      en: 'The −3 bonhomme: the trick it lands in costs its winner 3 points. A gift you re-gift — discard it on a trick the opponents are winning.',
      fr: 'Le bonhomme à −3 : la levée où il tombe coûte 3 points à qui la gagne. Un cadeau que tu refiles — défausse-le sur une levée que les adversaires sont en train de gagner.',
    },
    see: ['red0', 'chute'],
  },
  levee: {
    color: GOLD,
    term: { en: 'Trick (levée)', fr: 'La levée' },
    def: {
      en: 'One card from each of the four players. The highest trump takes it — no trump played, the highest card of the led suit. Each trick is 1 point; 8 tricks plus the two 0s make 10 points a round.',
      fr: "Une carte de chacun des quatre joueurs. L'atout le plus haut la remporte — pas d'atout joué, c'est la plus haute carte de la couleur demandée. Chaque levée vaut 1 point; 8 levées plus les deux 0, ça fait 10 points par ronde.",
    },
    see: ['maitre', 'atout', 'red0'],
  },
  maitre: {
    color: GOLD,
    term: { en: 'Boss card (maître)', fr: 'La carte maîtresse' },
    def: {
      en: "A card nothing still in play can beat: every higher card of its suit is already gone. Count what's been played to know when yours turn boss — and remember a trump can still ruff it.",
      fr: "Une carte que plus rien en jeu ne peut battre : toutes les plus hautes de sa couleur sont déjà sorties. Compte ce qui est sorti pour savoir quand les tiennes deviennent maîtresses — et oublie pas qu'un atout peut encore la couper.",
    },
    see: ['levee', 'coupe'],
  },
  atout: {
    color: GREEN,
    term: { en: 'Trump (atout)', fr: "L'atout" },
    def: {
      en: "The suit named by the contract winner's very first card. Any trump beats any card of the other suits — you only get to play one when you can't follow, or when trump itself is led.",
      fr: "La couleur nommée par la toute première carte du gagnant du contrat. N'importe quel atout bat n'importe quelle carte des autres couleurs — tu peux juste en jouer un quand tu ne peux pas fournir, ou quand on entame atout.",
    },
    see: ['coupe', 'sansatout', 'mise'],
  },
  coupe: {
    color: GREEN,
    term: { en: 'Ruff (coupe)', fr: 'La coupe' },
    def: {
      en: "Winning a trick with a trump because you're void in the led suit. The cheap way to steal big tricks — including the one carrying the red 0.",
      fr: "Gagner une levée avec un atout parce que tu n'as plus de cartes de la couleur demandée. Le moyen pas cher de voler les grosses levées — y compris celle qui transporte le 0 rouge.",
    },
    see: ['chute', 'atout', 'red0'],
  },
  chute: {
    color: GREEN,
    term: { en: 'Void (chute)', fr: 'La chute' },
    def: {
      en: 'Holding no cards of a suit. A void turns that suit into ruffing chances — you can even build one on purpose by shedding a lone card early.',
      fr: "N'avoir aucune carte d'une couleur. Une chute transforme cette couleur-là en occasions de couper — tu peux même t'en fabriquer une exprès en jetant une carte seule de bonne heure.",
    },
    see: ['coupe', 'brown0'],
  },
  mise: {
    color: BLUE,
    term: { en: 'The bid (mise)', fr: 'La mise' },
    def: {
      en: 'Your contract: 7 to 12 trick points, one round of bidding, dealer last. Make it and score +bid; miss it and score −bid — and the defenders keep every point they take either way, so a missed bid is a double gift. Bid the number your hand can really make (a made 9 beats a made 7); when it can’t, pass and bank points on defence.',
      fr: 'Ton contrat : 7 à 12 points de levées, une seule ronde de mises, le brasseur en dernier. Réussis-la et ton équipe marque ce montant; rate-la et elle le perd — et les défenseurs gardent leurs points dans les deux cas, alors une mise ratée est un cadeau double. Mise le nombre que ta main peut vraiment faire (un 9 réussi vaut mieux qu’un 7); sinon, passe et marque en défense.',
    },
    see: ['sansatout', 'brasseur', 'levee'],
  },
  sansatout: {
    color: BLUE,
    term: { en: 'Sans atout', fr: 'Le sans atout' },
    def: {
      en: 'A contract with no trump suit at all: the stake doubles, and an equal bid played sans atout outbids the plain one. Wants running suits and a stopper everywhere.',
      fr: "Un contrat sans aucune couleur d'atout : la mise double, et une mise égale jouée sans atout l'emporte sur la mise ordinaire. Ça prend des couleurs qui déroulent et un arrêt partout.",
    },
    see: ['mise', 'atout'],
  },
  hailmary: {
    color: BLUE,
    term: { en: '12 sans atout (hail-mary)', fr: '12 sans atout (tout ou rien)' },
    def: {
      en: 'An optional table rule: call 12 sans atout and make it to win the whole game on the spot — miss it and you lose the game outright. The comeback gamble when you are far behind. Making 12 means taking every trick but the one carrying the brown 0 (a clean sweep is only 10).',
      fr: "Une règle de table optionnelle : demande 12 sans atout et réussis-la pour gagner toute la partie d'un coup — rate-la et tu perds la partie sur-le-champ. Le pari de remontée quand tu tires de l'arrière. Réussir 12, c'est prendre toutes les levées sauf celle du 0 brun (ramasser les huit n'en fait que 10).",
    },
    see: ['sansatout', 'mise'],
  },
  brasseur: {
    color: BLUE,
    term: { en: 'Dealer (brasseur)', fr: 'Le brasseur' },
    def: {
      en: 'Deals the 8 cards and speaks last in the auction — which comes with the privilege of matching the standing bid instead of topping it. And when all four players pass, the brasseur is stuck with a forced bid of 7.',
      fr: 'Brasse et donne les 8 cartes, puis parle en dernier aux mises — ce qui lui donne le privilège d’égaler la mise en cours au lieu de la dépasser. Et quand les quatre joueurs passent, le brasseur est pris avec une mise forcée de 7.',
    },
    see: ['mise'],
  },
};

/** Glossary display groups — one color family per group. */
export const GLOSSARY_GROUPS: readonly { readonly ids: readonly ConceptId[] }[] = [
  { ids: ['red0', 'brown0'] },
  { ids: ['levee', 'maitre'] },
  { ids: ['atout', 'coupe', 'chute'] },
  { ids: ['mise', 'sansatout', 'hailmary', 'brasseur'] },
];
