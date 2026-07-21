import { useLang, type Lang } from '@jaffre/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpSheet, type ConceptId } from '../help/HelpSheet.js';
import { setLocalPaused } from '../local/localGame.js';
import { useGameStore } from '../state/gameStore.js';
import {
  hasSeenTutorial,
  loadTutorialSeen,
  markTutorialStep,
  skipTutorial,
  TUTORIAL_STEPS,
  type TutorialStep,
} from './tutorialPref.js';

/** Steps that render an in-play coach-mark (everything but the intro overlay). */
type MarkStep = Exclude<TutorialStep, 'intro'>;

const MARK_ORDER = TUTORIAL_STEPS.filter((s): s is MarkStep => s !== 'intro');

/**
 * Copy for the first-practice tutorial — every number and rule fact-checked
 * against packages/engine (rules.ts / reducer.ts / bidding.ts). Bilingual
 * en / fr-CA, following the T-table pattern used across the app; the locked
 * fr terms (levée, mise, brasseur, ronde, siège, tutoiement) are respected.
 */
interface Copy {
  readonly title: string;
  readonly body: string;
  /** Glossary entry the "Learn more" link deep-links into. */
  readonly concept: ConceptId;
}

const INTRO: Record<Lang, { title: string; body: string; start: string; skip: string }> = {
  en: {
    title: 'Welcome to practice',
    body: 'Two teams: you and the player across from you. First team to 41 points wins the game. I’ll flag a few things as they come up.',
    start: 'Start',
    skip: 'Skip tutorial',
  },
  fr: {
    title: 'Bienvenue à l’entraînement',
    body: 'Deux équipes : toi et le joueur en face de toi. La première équipe à 41 points gagne la partie. Je vais te signaler quelques affaires au fil du jeu.',
    start: 'Commencer',
    skip: 'Passer le tutoriel',
  },
};

const MARKS: Record<MarkStep, Record<Lang, Copy>> = {
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

const UI: Record<Lang, { got: string; learn: string; close: string }> = {
  en: { got: 'Got it', learn: 'Learn more', close: 'Dismiss tip' },
  fr: { got: 'Compris', learn: 'En savoir plus', close: 'Fermer le conseil' },
};

/** Coach-marks linger, then fade so they never pile up if the player looks away. */
const MARK_TTL_MS = 9000;

/**
 * The tutorial is off under automation so the e2e suite (which hits #practice
 * with a fresh, unseen profile) is untouched — same convention as the SW and
 * update toast. `?tut=1` forces it on for the screenshot pass.
 */
function tutorialEnabled(): boolean {
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    return new URLSearchParams(location.search).get('tut') === '1';
  }
  return true;
}

/**
 * First-practice tutorial: a one-time intro overlay (teams + first-to-41),
 * then contextual coach-marks fired by real local-game transitions, each shown
 * at most once ever. Mounted only on the practice table; a no-op online.
 */
export function TutorialCoach() {
  const lang = useLang();
  const view = useGameStore((s) => s.view);
  const heldTrick = useGameStore((s) => s.heldTrick);

  const [enabled] = useState(tutorialEnabled);
  const [introUp, setIntroUp] = useState(() => enabled && !hasSeenTutorial());
  const [queue, setQueue] = useState<readonly MarkStep[]>([]);
  const [helpJump, setHelpJump] = useState<ConceptId | null>(null);
  // Steps already handled this mount — guards against re-queuing on the next
  // store update before the localStorage write is read back.
  const seenRef = useRef<Set<string>>(loadTutorialSeen());

  // While the intro is up, freeze the bots so the auction waits behind it.
  useEffect(() => {
    if (!introUp) return undefined;
    setLocalPaused(true);
    return () => setLocalPaused(false);
  }, [introUp]);

  const dismissIntro = useCallback(() => {
    markTutorialStep('intro');
    seenRef.current.add('intro');
    setIntroUp(false);
  }, []);

  const skipAll = useCallback(() => {
    skipTutorial();
    seenRef.current = new Set(TUTORIAL_STEPS);
    setQueue([]);
    setIntroUp(false);
  }, []);

  // Detect which coach-marks should fire from the current game state. Each is
  // marked seen the instant its trigger is met, so transient triggers (a 0 on
  // the table) are caught even though the moment passes.
  useEffect(() => {
    if (!enabled || introUp || view === null) return;
    const seen = seenRef.current;
    const fired: MarkStep[] = [];
    const consider = (id: MarkStep, cond: boolean): void => {
      if (cond && !seen.has(id)) fired.push(id);
    };

    const zeroOnTable = (suit: 'red' | 'brown'): boolean =>
      view.currentTrick.some((p) => p.card.suit === suit && p.card.value === 0) ||
      (heldTrick?.specials.includes(suit === 'red' ? 'red_zero' : 'brown_zero') ?? false);

    consider('bidding', view.phase === 'bidding');
    consider(
      'firstBet',
      view.bids.some((b) => b.choice.kind === 'bid'),
    );
    consider('trump', view.trumpDecided && view.trump !== null);
    consider('redZero', zeroOnTable('red'));
    consider('brownZero', zeroOnTable('brown'));
    consider('firstTrick', heldTrick !== null || view.capturedTricks.length >= 1);
    consider('roundOver', view.phase === 'round_over');

    if (fired.length === 0) return;
    for (const id of fired) {
      seen.add(id);
      markTutorialStep(id);
    }
    fired.sort((a, b) => MARK_ORDER.indexOf(a) - MARK_ORDER.indexOf(b));
    setQueue((q) => [...q, ...fired]);
  }, [enabled, introUp, view, heldTrick]);

  const current = queue[0] ?? null;

  // Each coach-mark auto-dismisses after a spell so they never stack up.
  useEffect(() => {
    if (current === null) return undefined;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), MARK_TTL_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!enabled) return null;

  const dismissMark = (): void => setQueue((q) => q.slice(1));

  return (
    <>
      {introUp &&
        createPortal(
          <IntroOverlay lang={lang} onStart={dismissIntro} onSkip={skipAll} />,
          document.body,
        )}
      {current !== null &&
        createPortal(
          <Mark
            copy={MARKS[current][lang]}
            lang={lang}
            onLearn={() => setHelpJump(MARKS[current][lang].concept)}
            onClose={dismissMark}
          />,
          document.body,
        )}
      {helpJump !== null && <HelpSheet jumpTo={helpJump} onClose={() => setHelpJump(null)} />}
    </>
  );
}

/** The welcome overlay: teams + first-to-41, with a skip. Pauses the bots. */
function IntroOverlay({
  lang,
  onStart,
  onSkip,
}: {
  readonly lang: Lang;
  readonly onStart: () => void;
  readonly onSkip: () => void;
}) {
  const t = INTRO[lang];
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    startRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onStart();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onStart]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        aria-hidden
        onClick={onStart}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tut-intro-title"
        className="pop-in relative flex w-[min(94vw,28rem)] flex-col gap-4 rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-6 font-arcade-ui shadow-(--shadow-ap-hero)"
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="text-(length:--text-fluid-2xl) text-(--color-ap-gold)">
            ❖
          </span>
          <h2
            id="tut-intro-title"
            className="font-arcade-display text-(length:--text-fluid-2xl) uppercase text-(--color-ap-gold)"
          >
            {t.title}
          </h2>
        </div>
        <p className="text-(length:--text-fluid-sm) leading-relaxed text-(--color-ap-text)/90">
          {t.body}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="cursor-pointer rounded-(--radius-ap-control) px-3 py-2 text-(length:--text-fluid-sm) text-(--color-ap-muted) underline decoration-dotted underline-offset-2 hover:text-(--color-ap-text)"
          >
            {t.skip}
          </button>
          <button
            ref={startRef}
            type="button"
            onClick={onStart}
            className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-5 py-2 font-arcade-display text-(length:--text-fluid-sm) uppercase text-(--color-ap-ink) shadow-(--shadow-ap-sm) hover:brightness-105"
          >
            {t.start}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A single top-of-felt coach-mark: title, one line, "Learn more" + dismiss. */
function Mark({
  copy,
  lang,
  onLearn,
  onClose,
}: {
  readonly copy: Copy;
  readonly lang: Lang;
  readonly onLearn: () => void;
  readonly onClose: () => void;
}) {
  const u = UI[lang];
  return (
    <div className="pointer-events-none fixed left-1/2 top-[4.75rem] z-40 w-[min(94vw,30rem)] -translate-x-1/2 px-2 max-sm:top-[4.25rem]">
      {/* An ink card with a gold spark — permanently dark, so its text is white
          (not the theme-flipping --color-ap-text). Matches CoachHint's look. */}
      <div
        role="status"
        className="pop-in pointer-events-auto rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-3 shadow-(--shadow-ap-hero)"
      >
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-0.5 text-(--color-ap-gold)">
            ❖
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-gold)">
              {copy.title}
            </h3>
            <p className="mt-0.5 font-arcade-ui text-(length:--text-fluid-sm) leading-snug text-white/90">
              {copy.body}
            </p>
            <button
              type="button"
              onClick={onLearn}
              className="mt-1.5 cursor-pointer text-(length:--text-fluid-xs) text-(--color-ap-gold)/90 underline decoration-dotted underline-offset-2 hover:text-(--color-ap-gold)"
            >
              {u.learn} ↗
            </button>
          </div>
          <button
            type="button"
            aria-label={u.close}
            onClick={onClose}
            className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
