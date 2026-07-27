import { useLang, type Lang } from '@jaffre/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpSheet, type ConceptId } from '../help/HelpSheet.js';
import { setLocalPaused } from '../local/localGame.js';
import { useGameStore } from '../state/gameStore.js';
import {
  hasSeenOnlineIntro,
  hasSeenTutorial,
  loadTutorialSeen,
  markOnlineIntroSeen,
  markTutorialRewardGranted,
  markTutorialStep,
  skipTutorial,
  tutorialRewardGranted,
  TUTORIAL_STEPS,
  TUTORIAL_RESET_EVENT,
} from './tutorialPref.js';
import { MARK_ORDER, MARKS, type MarkCopy, type MarkStep } from './tutorialSteps.js';
import { grantAward } from '../net/awards.js';

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

/** The lite first-online-game card: three facts, no frozen bots, no sequence. */
const ONLINE_INTRO: Record<Lang, { title: string; body: string; start: string; skip: string }> = {
  en: {
    title: 'First time at a table?',
    body: 'Bids are points, not tricks — 11 in play each round. Trump is whatever suit the declarer leads first. The Coach can suggest bids and cards while you learn.',
    start: 'Turn Coach on',
    skip: 'Got it',
  },
  fr: {
    title: 'Première fois à une table?',
    body: 'Les mises sont des points, pas des levées — 11 en jeu par ronde. L’atout, c’est la couleur que le déclarant joue en premier. Le Coach peut te suggérer mises et cartes pendant que tu apprends.',
    start: 'Activer le Coach',
    skip: 'Compris',
  },
};

/** The subset of coach-marks worth firing at an online table — the three
 * make-or-break concepts, shared with the practice progress store so nothing
 * ever repeats between modes. */
const ONLINE_MARKS: readonly MarkStep[] = ['bidding', 'trump', 'firstTrick'];

const UI: Record<Lang, { learn: string; close: string; learning: string; complete: string }> = {
  en: { learn: 'Learn more', close: 'Dismiss tip', learning: 'Learning', complete: 'Complete!' },
  fr: {
    learn: 'En savoir plus',
    close: 'Fermer le conseil',
    learning: 'Apprentissage',
    complete: 'Terminé !',
  },
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
 * at most once ever. Mounted on the practice table, and — in `online` mode —
 * on a real room table as a lite variant: one compact intro card (only when
 * the practice tutorial was never taken) plus the three make-or-break marks,
 * with no frozen bots, no progress pip and no skip-all.
 */
export function TutorialCoach({
  online = false,
  onEnableCoach,
}: {
  /** Lite mode for a real room: one card + three marks, nothing frozen. */
  readonly online?: boolean;
  /** Online intro's "Turn Coach on" — flips the table's coach toggle. */
  readonly onEnableCoach?: () => void;
}) {
  const lang = useLang();
  const view = useGameStore((s) => s.view);
  const heldTrick = useGameStore((s) => s.heldTrick);

  const [enabled] = useState(tutorialEnabled);
  const [introUp, setIntroUp] = useState(
    () => enabled && !hasSeenTutorial() && (!online || !hasSeenOnlineIntro()),
  );
  const [queue, setQueue] = useState<readonly MarkStep[]>([]);
  const [helpJump, setHelpJump] = useState<ConceptId | null>(null);
  // Steps already handled this mount — guards against re-queuing on the next
  // store update before the localStorage write is read back. Also the live
  // source for the progress pip (mutated as marks fire; the component always
  // re-renders alongside via setQueue).
  const seenRef = useRef<Set<string>>(loadTutorialSeen());
  const seenCount = (): number => MARK_ORDER.filter((s) => seenRef.current.has(s)).length;
  // Once every step is already seen at mount, the pip has nothing to show —
  // keep it (and the brief "Complete!" flash) hidden from the start.
  const [pipDone, setPipDone] = useState(() => seenCount() === MARK_ORDER.length);

  // While the intro is up, freeze the bots so the auction waits behind it.
  // Online there is nothing local to freeze — the room plays on behind the card.
  useEffect(() => {
    if (!introUp || online) return undefined;
    setLocalPaused(true);
    return () => setLocalPaused(false);
  }, [introUp, online]);

  const dismissIntro = useCallback(() => {
    if (online) {
      markOnlineIntroSeen();
    } else {
      markTutorialStep('intro');
      seenRef.current.add('intro');
    }
    setIntroUp(false);
  }, [online]);

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
      if (online && !ONLINE_MARKS.includes(id)) return;
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
  }, [enabled, introUp, view, heldTrick, online]);

  const current = queue[0] ?? null;

  // Each coach-mark auto-dismisses after a spell so they never stack up.
  useEffect(() => {
    if (current === null) return undefined;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), MARK_TTL_MS);
    return () => clearTimeout(t);
  }, [current]);

  // "Replay tutorial" (from the HelpSheet) clears progress in this same tab —
  // re-arm live: wipe what we've seen, re-show the intro, drop any queue.
  // Practice only: mid-room, re-arming a welcome overlay would be noise.
  useEffect(() => {
    if (online) return undefined;
    const onReset = (): void => {
      seenRef.current = new Set();
      setQueue([]);
      setPipDone(false);
      if (enabled) setIntroUp(true);
    };
    window.addEventListener(TUTORIAL_RESET_EVENT, onReset);
    return () => window.removeEventListener(TUTORIAL_RESET_EVENT, onReset);
  }, [enabled, online]);

  const progress = seenCount();
  const total = MARK_ORDER.length;

  // At 7/7 the pip flashes "Complete!" once it's actually on screen (i.e. no
  // mark is covering it), then retires for good.
  useEffect(() => {
    if (pipDone || progress < total || current !== null) return undefined;
    const t = setTimeout(() => setPipDone(true), 2600);
    return () => clearTimeout(t);
  }, [pipDone, progress, total, current]);

  // Completing every coach-mark earns the tutorial award (which unlocks the
  // Classic OG bonhomme). Latch only AFTER the server confirms the grant, so a brand-new user
  // who finishes offline / before any identity exists retries on the next
  // practice visit instead of silently losing the award (the grant is
  // idempotent server-side, so a retry never double-grants).
  useEffect(() => {
    if (progress < total || tutorialRewardGranted()) return;
    void grantAward('tutorial-complete').then((ok) => {
      if (ok) markTutorialRewardGranted();
    });
  }, [progress, total]);

  if (!enabled) return null;

  const dismissMark = (): void => setQueue((q) => q.slice(1));

  // The pip steps aside while a mark or the intro is up (on a phone the mark
  // spans the width), and retires once complete or nothing is left to track.
  // Online the lite variant tracks nothing — no pip at all.
  const showPip = !online && !introUp && !pipDone && current === null;

  return (
    <>
      {introUp &&
        createPortal(
          <IntroOverlay
            copy={(online ? ONLINE_INTRO : INTRO)[lang]}
            onStart={
              online
                ? () => {
                    onEnableCoach?.();
                    dismissIntro();
                  }
                : dismissIntro
            }
            onSkip={online ? dismissIntro : skipAll}
            onDismiss={dismissIntro}
          />,
          document.body,
        )}
      {current !== null &&
        createPortal(
          // key: each mark MOUNTS fresh — the pop-in replays and the arm-delay
          // guard resets, so when one tip follows another the swap is visible
          // and the tap (or ghost click) that closed the first can't also land
          // on the second's identically-placed ✕.
          <Mark
            key={current}
            copy={MARKS[current][lang]}
            lang={lang}
            onLearn={() => setHelpJump(MARKS[current][lang].concept)}
            onClose={dismissMark}
          />,
          document.body,
        )}
      {showPip &&
        createPortal(
          <ProgressPip lang={lang} seen={progress} total={total} done={progress >= total} />,
          document.body,
        )}
      {helpJump !== null && <HelpSheet jumpTo={helpJump} onClose={() => setHelpJump(null)} />}
    </>
  );
}

/**
 * A compact "Learning · 3/7" chip that fills as the coach-marks fire, tucked
 * top-left under the status bar and clear of the felt action. Click-through
 * (it owns no controls); flips to "Complete!" for a beat at 7/7.
 */
function ProgressPip({
  lang,
  seen,
  total,
  done,
}: {
  readonly lang: Lang;
  readonly seen: number;
  readonly total: number;
  readonly done: boolean;
}) {
  const u = UI[lang];
  const pct = total === 0 ? 0 : Math.round((seen / total) * 100);
  return (
    <div
      role="status"
      aria-label={done ? u.complete : `${u.learning} ${seen}/${total}`}
      className="pointer-events-none fixed right-2 top-[4.75rem] z-30 max-sm:right-1.5 max-sm:top-[4.25rem]"
    >
      <div className="pop-in flex items-center gap-2 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) py-1.5 pl-2.5 pr-3 shadow-(--shadow-ap)">
        <span aria-hidden className="text-(--color-ap-gold)">
          ❖
        </span>
        <span className="font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-white/90">
          {done ? u.complete : u.learning}
        </span>
        {!done && (
          <>
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <span
                className="block h-full rounded-full bg-(--color-ap-gold) transition-[width] duration-(--duration-flick)"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="font-arcade-ui text-(length:--text-fluid-xs) tabular-nums text-white/70">
              {seen}/{total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** The welcome overlay: title + one paragraph + primary/secondary actions.
 * Practice: teams + first-to-41 (Start / Skip, backdrop = Start). Online lite:
 * three facts (Turn Coach on / Got it, backdrop = Got it via onDismiss). */
function IntroOverlay({
  copy,
  onStart,
  onSkip,
  onDismiss,
}: {
  readonly copy: { title: string; body: string; start: string; skip: string };
  readonly onStart: () => void;
  readonly onSkip: () => void;
  /** Backdrop click / Escape — the "just get out of my way" path. */
  readonly onDismiss: () => void;
}) {
  const t = copy;
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    startRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        aria-hidden
        onClick={onDismiss}
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
  readonly copy: MarkCopy;
  readonly lang: Lang;
  readonly onLearn: () => void;
  readonly onClose: () => void;
}) {
  const u = UI[lang];
  // A tip is inert for its first beat: after one mark replaces another the ✕
  // sits at the exact same spot, and on mobile the synthesized click / a fast
  // double-tap from dismissing the previous tip would instantly kill this one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    // z-[48]: above every in-game overlay (the round summary is a full-screen
    // z-[45] scene that was burying the round-over tip) but below the z-50
    // sheets, matching ConnectionBanner's slot.
    <div className="pointer-events-none fixed left-1/2 top-[4.75rem] z-[48] w-[min(94vw,30rem)] -translate-x-1/2 px-2 max-sm:top-[4.25rem]">
      {/* An ink card with a gold spark — permanently dark, so its text is white
          (not the theme-flipping --color-ap-text). Matches CoachHint's look. */}
      <div
        role="status"
        className={`pop-in ${armed ? 'pointer-events-auto' : 'pointer-events-none'} rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-3 shadow-(--shadow-ap-hero)`}
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
