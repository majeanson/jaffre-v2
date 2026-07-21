import type { Lang } from '@jaffre/ui';
import type { ConceptId } from '../help/HelpSheet.js';
import { TUTORIAL_STEPS, type TutorialStep } from './tutorialPref.js';

/**
 * The seven in-play coach-mark steps and their bilingual copy — every number
 * and rule fact-checked against packages/engine (rules.ts / reducer.ts /
 * bidding.ts). Kept in its own module (imported by both TutorialCoach and the
 * HelpSheet checklist) so the two share one source of truth without a runtime
 * import cycle — the `ConceptId` / `Lang` imports here are type-only.
 *
 * fr is fr-CA with the locked terms respected (levée, mise, brasseur, ronde,
 * siège, tutoiement).
 */

/** Steps that render an in-play coach-mark (everything but the intro overlay). */
export type MarkStep = Exclude<TutorialStep, 'intro'>;

/** The seven coach-mark steps, in the order they naturally occur. */
export const MARK_ORDER: readonly MarkStep[] = TUTORIAL_STEPS.filter(
  (s): s is MarkStep => s !== 'intro',
);

export interface MarkCopy {
  readonly title: string;
  readonly body: string;
  /** Glossary entry the "Learn more" link deep-links into. */
  readonly concept: ConceptId;
}

export const MARKS: Record<MarkStep, Record<Lang, MarkCopy>> = {
  bidding: {
    en: {
      title: 'The auction',
      body: 'One round of bidding — each seat speaks once, the dealer last. Bid 7 to 12 trick points or pass; if all four pass, the dealer is forced to 7.',
      concept: 'mise',
    },
    fr: {
      title: 'Les mises',
      body: 'Une seule ronde de mises — chaque siège parle une fois, le brasseur en dernier. Mise de 7 à 12 points de levées, ou passe; si les quatre passent, le brasseur est forcé à 7.',
      concept: 'mise',
    },
  },
  firstBet: {
    en: {
      title: 'First bet is in',
      body: 'A bet promises that many trick points this round. The highest bet takes the contract — sans atout doubles the stake and outbids an equal plain bet.',
      concept: 'mise',
    },
    fr: {
      title: 'Première mise',
      body: 'Une mise promet ce nombre de points de levées pour la ronde. La plus haute mise prend le contrat — le sans atout double la mise et l’emporte sur une mise ordinaire égale.',
      concept: 'mise',
    },
  },
  trump: {
    en: {
      title: 'Trump is set',
      body: 'The contract winner’s first card names the trump suit. Any trump beats any card of the other suits, and you must follow the led suit whenever you can.',
      concept: 'atout',
    },
    fr: {
      title: 'L’atout est fixé',
      body: 'La première carte du gagnant du contrat nomme l’atout. N’importe quel atout bat n’importe quelle carte des autres couleurs, et tu dois fournir la couleur demandée quand tu peux.',
      concept: 'atout',
    },
  },
  redZero: {
    en: {
      title: 'The red 0 (+5)',
      body: 'The biggest prize of the round. Whoever wins the trick it lands in scores 5 extra points — that trick is worth 6 in total.',
      concept: 'red0',
    },
    fr: {
      title: 'Le 0 rouge (+5)',
      body: 'Le plus gros lot de la ronde. L’équipe qui gagne la levée où il tombe marque 5 points de plus — cette levée-là vaut 6 au total.',
      concept: 'red0',
    },
  },
  brownZero: {
    en: {
      title: 'The brown 0 (−2)',
      body: 'The trick it lands in costs its winner 2 points. Best handed to a trick the other team is already winning.',
      concept: 'brown0',
    },
    fr: {
      title: 'Le 0 brun (−2)',
      body: 'La levée où il tombe coûte 2 points à qui la gagne. Le mieux, c’est de le refiler sur une levée que l’autre équipe est déjà en train de gagner.',
      concept: 'brown0',
    },
  },
  firstTrick: {
    en: {
      title: 'First trick (levée)',
      body: 'One card from each seat; the highest trump takes it, or the highest card of the led suit if no trump was played. Each trick is 1 point — 8 tricks plus the two 0s make 11 a round.',
      concept: 'levee',
    },
    fr: {
      title: 'Première levée',
      body: 'Une carte de chaque siège; l’atout le plus haut la remporte, sinon la plus haute carte de la couleur demandée. Chaque levée vaut 1 point — 8 levées plus les deux 0 font 11 par ronde.',
      concept: 'levee',
    },
  },
  roundOver: {
    en: {
      title: 'Round scored',
      body: 'Make your bet and your team scores +the bet (×2 sans atout); miss it and score −the bet. Defenders always keep the trick points they took. First team to 41 wins.',
      concept: 'mise',
    },
    fr: {
      title: 'Ronde comptée',
      body: 'Fais ta mise et ton équipe marque +la mise (×2 sans atout); rate-la et tu marques −la mise. Les défenseurs gardent toujours les points de levées qu’ils ont pris. Première équipe à 41 gagne.',
      concept: 'mise',
    },
  },
};
