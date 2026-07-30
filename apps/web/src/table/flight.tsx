import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { SeatView } from '@jaffre/engine';
import type { TeamSpecials } from '@jaffre/ui';
import { reducedMotion } from './dealPace.js';
import { paced } from './pacePref.js';
import type { ContractDisplay } from './useTableDerived.js';

/**
 * The navbar receives the game: every change to the top bar's numbers arrives
 * as a visible delivery from the felt event that caused it. The mid-felt toast
 * stack (TrickBanner, TrumpCallout) and Table's own contract/score watchers
 * are the launch pads; the bar's chips (ScoreStrip's `data-flight-target`s)
 * are the landing pads. See docs/archive/PLAN-scoreboard-delivery.md for the
 * full picture
 * — this file is the ONE mechanism every delivery rides: FlightLayer renders
 * the clones, launchFlight animates one, and the hold store makes the bar's
 * DISPLAYED value wait for the landing instead of jumping ahead of it.
 */

/* ── Landing pads + hold keys ────────────────────────────────────────────
 * Two different things share the "score-N" name on purpose: it's both a
 * FlightTarget (where a clone lands — the team's pill) and a HoldKey (what's
 * masked while airborne — the big score number). Trick points land on the
 * SAME pill but mask a different sub-part (round points / trick tally), so
 * it gets its own hold key that isn't a flight target at all. The specials
 * badges (red/brown 0) land on that same pill too, on their OWN delayed
 * flight (see TrickBanner) — they get a THIRD hold key of their own rather
 * than reusing points-N, because they don't land when points-N does: masking
 * them under points-N released the specials chip in the bar before its own
 * flight had actually arrived (G11). */

type ScoreSlot = `score-${0 | 1}`;
type PointsSlot = `points-${0 | 1}`;
type SpecialsSlot = `specials-${0 | 1}`;

/** Where a flight can land — matches a `[data-flight-target="<id>"]` node. */
export type FlightTarget = ScoreSlot | 'trump' | 'contract';

/** What a hold masks in the bar's display (see `useHeldDisplay`). */
export type HoldKey = PointsSlot | ScoreSlot | SpecialsSlot | 'trump' | 'contract';

export function scoreTarget(team: 0 | 1): ScoreSlot {
  return `score-${team}`;
}

export function pointsHoldKey(team: 0 | 1): PointsSlot {
  return `points-${team}`;
}

/** Held from the instant a trick with a special is announced until ITS OWN
 * (delayed, see TrickBanner) flight lands — deliberately separate from
 * `pointsHoldKey`, which lands ~200ms earlier. */
export function specialsHoldKey(team: 0 | 1): SpecialsSlot {
  return `specials-${team}`;
}

/* ── Holds — the wait-for-landing truth model ────────────────────────────
 * Game truth (the store's `view`) is never touched here; only what Table
 * hands to <TopBar> is. A tiny module store, subscribable like dealPace's
 * `activeUntil` idiom but with listeners — React re-renders on a hold or
 * release via `useSyncExternalStore`, and non-React callers (launchFlight)
 * read/write it directly. */

/** A flight can be lost — a tab hidden mid-animation, a trick skipped out
 * from under it — so every hold self-releases. This is a hard safety cap,
 * NOT a duration to `paced()`: the bar must never wait out a whole cinematic
 * flight time for a value that has nowhere left to arrive from. */
const HOLD_TIMEOUT_MS = 900;

const heldTimers = new Map<HoldKey, number>();
let holdVersion = 0;
const holdListeners = new Set<() => void>();

function bumpHold(): void {
  holdVersion += 1;
  for (const listener of holdListeners) listener();
}

/**
 * Mask `key` in the bar's display until its flight lands (see `release`), or
 * until `HOLD_TIMEOUT_MS` passes, whichever comes first. Returns a release
 * function equivalent to `release(key)` — most callers hold and launch in the
 * same breath and never need it; it exists for symmetry and for a caller that
 * holds well before it can measure a source rect to launch from.
 */
export function hold(key: HoldKey): () => void {
  const already = heldTimers.has(key);
  const previous = heldTimers.get(key);
  if (previous !== undefined) window.clearTimeout(previous);
  heldTimers.set(
    key,
    window.setTimeout(() => release(key), HOLD_TIMEOUT_MS),
  );
  if (!already) bumpHold();
  return () => release(key);
}

/**
 * Resolve a hold — the masked render reads live again from the next render
 * on. A no-op when `key` isn't held: the specials flight, the auto-timeout,
 * and a normal landing can all race to call this for the same key, and only
 * the first one should count.
 */
export function release(key: HoldKey): void {
  const timer = heldTimers.get(key);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  heldTimers.delete(key);
  bumpHold();
}

function isHeld(key: HoldKey): boolean {
  return heldTimers.has(key);
}

/**
 * Every hold snaps open at once — a round boundary or the game ending. Game
 * truth never waited on a flight; only the display did, and a value carried
 * by a flight from a round that's over isn't worth finishing the wait for.
 */
export function snapAll(): void {
  if (heldTimers.size === 0) return;
  for (const timer of heldTimers.values()) window.clearTimeout(timer);
  heldTimers.clear();
  bumpHold();
}

function subscribeHold(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => holdListeners.delete(listener);
}

function getHoldVersion(): number {
  return holdVersion;
}

/* ── useHeldDisplay — the DISPLAYED bar lags, game truth never does ────── */

export interface HeldDisplay {
  readonly view: SeatView | null;
  readonly trickCounts: readonly [number, number];
  readonly contract: ContractDisplay | null;
  readonly specials: readonly [TeamSpecials, TeamSpecials];
}

/**
 * Table calls this once, right before handing `view`/`trickCounts`/`contract`/
 * `specials` to `<TopBar>`: whatever is currently held reads as its PREVIOUS
 * value (or, for trump/contract — which only ever transition once per round —
 * as simply not-yet-decided) until the flight carrying it lands. Everywhere
 * else in Table (Stage, PlayerHand, seat chips) keeps reading the real,
 * unmasked `view` — only the bar waits.
 *
 * ORDERING CONTRACT: the previous-value refs are captured in a layout effect,
 * per key, only while that key is NOT held — and every hold must land before
 * that capture runs. Launch sites in CHILD components (TrickBanner,
 * TrumpCallout) get this for free (children's layout effects run before their
 * parents'); Table's own contract/score watchers must be REGISTERED BEFORE
 * this hook is called (hooks fire effects in call order). Capture during the
 * render phase — the obvious version — is wrong: the render that carries the
 * bumped value runs before the hold exists, so the "previous" ref would
 * already hold the new number by the time the mask engages, and the whole
 * wait-for-landing model would silently no-op.
 */
export function useHeldDisplay(
  view: SeatView | null,
  trickCounts: readonly [number, number],
  contract: ContractDisplay | null,
  specials: readonly [TeamSpecials, TeamSpecials],
): HeldDisplay {
  // The only way this hook's owner re-renders on a hold/release with nothing
  // else about the game having changed.
  useSyncExternalStore(subscribeHold, getHoldVersion, getHoldVersion);

  // A new round, or the game ending, makes any airborne hold stale — snap the
  // display straight to the truth rather than waiting out a flight that no
  // longer means anything. A reconnect's fresh `view` reference is fine as-is
  // (nothing was held across a reload); roundIndex + phase alone catch the
  // discontinuities that matter.
  const prevRoundIndexRef = useRef(view?.roundIndex ?? null);
  const prevPhaseRef = useRef(view?.phase ?? null);
  useLayoutEffect(() => {
    if (view === null) return;
    const newRound = prevRoundIndexRef.current !== view.roundIndex;
    const justEnded = prevPhaseRef.current !== 'game_over' && view.phase === 'game_over';
    if (newRound || justEnded) snapAll();
    prevRoundIndexRef.current = view.roundIndex;
    prevPhaseRef.current = view.phase;
  }, [view]);

  // The last value the bar actually showed, per masked field.
  const prevRoundPoints = useRef<readonly [number, number]>(view?.roundPoints ?? [0, 0]);
  const prevTrickCounts = useRef<readonly [number, number]>(trickCounts);
  const prevScores = useRef<readonly [number, number]>(view?.scores ?? [0, 0]);
  const prevSpecials = useRef<readonly [TeamSpecials, TeamSpecials]>(specials);

  // Capture AFTER every launch site's hold has landed (see the ordering
  // contract above). Per team, per field: a held key skips its capture, so
  // the ref keeps the pre-change value for the masked re-render that this
  // same hold just scheduled (useSyncExternalStore flushes it before paint —
  // the unmasked first commit never reaches the screen).
  useLayoutEffect(() => {
    if (view === null) return;
    for (const team of [0, 1] as const) {
      if (!isHeld(pointsHoldKey(team))) {
        prevRoundPoints.current = withAt(prevRoundPoints.current, team, view.roundPoints[team]);
        prevTrickCounts.current = withAt(prevTrickCounts.current, team, trickCounts[team]);
      }
      // Specials have their OWN hold (see flight.ts) — it lands later than
      // points-N, so its capture must gate separately or the pre-change ref
      // would be overwritten while the specials chip is still airborne.
      if (!isHeld(specialsHoldKey(team))) {
        prevSpecials.current =
          team === 0
            ? [specials[0], prevSpecials.current[1]]
            : [prevSpecials.current[0], specials[1]];
      }
      if (!isHeld(scoreTarget(team))) {
        prevScores.current = withAt(prevScores.current, team, view.scores[team]);
      }
    }
  });

  if (view === null || reducedMotion()) {
    // Passthrough: nothing is ever held under reduced motion (every launch
    // site's flight lands instantly, see launchFlight); the capture effect
    // above still keeps the refs seeded.
    return { view, trickCounts, contract, specials };
  }

  const points0Held = isHeld(pointsHoldKey(0));
  const points1Held = isHeld(pointsHoldKey(1));
  const specials0Held = isHeld(specialsHoldKey(0));
  const specials1Held = isHeld(specialsHoldKey(1));
  const score0Held = isHeld(scoreTarget(0));
  const score1Held = isHeld(scoreTarget(1));
  const trumpHeld = isHeld('trump');
  const contractHeld = isHeld('contract');

  const displayedRoundPoints: readonly [number, number] = [
    points0Held ? prevRoundPoints.current[0] : view.roundPoints[0],
    points1Held ? prevRoundPoints.current[1] : view.roundPoints[1],
  ];
  const displayedTrickCounts: readonly [number, number] = [
    points0Held ? prevTrickCounts.current[0] : trickCounts[0],
    points1Held ? prevTrickCounts.current[1] : trickCounts[1],
  ];
  const displayedScores: readonly [number, number] = [
    score0Held ? prevScores.current[0] : view.scores[0],
    score1Held ? prevScores.current[1] : view.scores[1],
  ];
  const displayedSpecials: readonly [TeamSpecials, TeamSpecials] = [
    specials0Held ? prevSpecials.current[0] : specials[0],
    specials1Held ? prevSpecials.current[1] : specials[1],
  ];

  const displayedView: SeatView = {
    ...view,
    roundPoints: displayedRoundPoints,
    scores: displayedScores,
    trump: trumpHeld ? null : view.trump,
    trumpDecided: trumpHeld ? false : view.trumpDecided,
    contract: contractHeld ? null : view.contract,
  };

  return {
    view: displayedView,
    trickCounts: displayedTrickCounts,
    contract: contractHeld ? null : contract,
    specials: displayedSpecials,
  };
}

/** Tuple-preserving single-slot update — keeps the refs' readonly pair type. */
function withAt(
  pair: readonly [number, number],
  at: 0 | 1,
  value: number,
): readonly [number, number] {
  return at === 0 ? [value, pair[1]] : [pair[0], value];
}

/* ── launchFlight + FlightLayer — the visible delivery ───────────────────── */

interface Clone {
  readonly id: number;
  readonly fromCenter: { readonly x: number; readonly y: number };
  readonly toCenter: { readonly x: number; readonly y: number };
  readonly payload: ReactNode;
  readonly key: HoldKey | undefined;
  readonly burst: boolean;
}

/** Set by the one mounted FlightLayer (real play only); null in scenes,
 * replay, or the brief instant before Table's layer has committed. Its mere
 * presence is the whole scenes/replay gate — see `launchFlight`. */
let spawnClone: ((clone: Clone) => void) | null = null;
let nextFlightId = 0;

export interface LaunchFlightArgs {
  /** Measured synchronously, at call time — pass the source element itself
   * (not a rect captured earlier), while it's still mounted. */
  readonly from: DOMRect | Element;
  readonly to: FlightTarget;
  /** The clone's contents — a small chip styled to mimic what it's carrying. */
  readonly payload: ReactNode;
  /** Released when the flight lands, or right away if it never really
   * launches (see the no-op conditions below). Omit for a flight that
   * carries no held value of its own (the specials' second flight). */
  readonly key?: HoldKey;
  /** Bigger landing emphasis (`special-burst`) — the specials badge. */
  readonly burst?: boolean;
}

/** The viewport's own centre, shaped like an element rect — the round-total
 * flight's source when there's no more specific one: the round-summary
 * overlay owns the whole screen at that moment, so its centre IS this. */
export function viewportCentreRect(): DOMRect {
  return new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
}

/**
 * Fly `payload` from `from` to the `[data-flight-target="<to>"]` node,
 * holding `key` (if given) until it lands. No FlightLayer mounted, no
 * matching target, reduced motion, or a hidden document — nothing to
 * meaningfully animate toward — lands instantly instead: `key` releases right
 * away and no clone ever appears. Every launch site calls this the same way
 * regardless of which case it turns out to be.
 */
export function launchFlight({ from, to, payload, key, burst = false }: LaunchFlightArgs): void {
  const landInstantly = (): void => {
    if (key !== undefined) release(key);
  };
  if (spawnClone === null || reducedMotion() || document.hidden) {
    landInstantly();
    return;
  }
  const target = document.querySelector(`[data-flight-target="${to}"]`);
  if (target === null) {
    landInstantly();
    return;
  }
  const fromRect = from instanceof Element ? from.getBoundingClientRect() : from;
  const toRect = target.getBoundingClientRect();
  spawnClone({
    id: ++nextFlightId,
    fromCenter: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
    toCenter: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
    payload,
    key,
    burst,
  });
}

/**
 * One in-flight clone: positioned at its source's centre, then WAAPI-animated
 * to its target's centre with a short upward arc (a −40px mid-flight offset)
 * and a gentle scale-down. `element.animate()` rather than a shared CSS
 * keyframe, because the path itself — the translate delta — is different on
 * every single flight.
 */
function FlightClone({
  clone,
  onDone,
}: {
  readonly clone: Clone;
  readonly onDone: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const dx = clone.toCenter.x - clone.fromCenter.x;
    const dy = clone.toCenter.y - clone.fromCenter.y;
    const animation = el.animate(
      [
        { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)' },
        {
          transform: `translate(-50%, -50%) translate(${String(dx / 2)}px, ${String(
            dy / 2 - 40,
          )}px) scale(0.925)`,
        },
        {
          transform: `translate(-50%, -50%) translate(${String(dx)}px, ${String(dy)}px) scale(0.85)`,
        },
      ],
      { duration: paced(600), easing: 'ease-out', fill: 'forwards' },
    );
    // finish and cancel both mean "this clone is done" — a cancel happens on
    // unmount (below) too, so guard against landing twice.
    let landed = false;
    const land = (): void => {
      if (landed) return;
      landed = true;
      if (clone.key !== undefined) release(clone.key);
      onDone(clone.id);
    };
    animation.addEventListener('finish', land);
    animation.addEventListener('cancel', land);
    return () => {
      animation.removeEventListener('finish', land);
      animation.removeEventListener('cancel', land);
      animation.cancel();
    };
    // A given `clone.id` is only ever rendered by one FlightClone instance
    // for its whole (single) lifetime — see FlightLayer — so this effect must
    // run exactly once. `clone` is identity-stable (it lives in the layer's
    // state array) and `onDone` is a stable useCallback; if either ever
    // changed identity, this effect would cancel-and-RESTART the animation
    // mid-air — which is exactly what happened when a sibling clone spawning
    // re-created the layer's remove closure.
  }, [clone, onDone]);

  return (
    <div
      ref={ref}
      data-testid="flight-chip"
      className={`pointer-events-none absolute ${clone.burst ? 'special-burst' : ''}`}
      style={{
        left: clone.fromCenter.x,
        top: clone.fromCenter.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {clone.payload}
    </div>
  );
}

/**
 * Mount once, real play only (`{dev && <FlightLayer />}` in Table): a fixed,
 * click-through layer above the felt AND the bar (z-49) that renders every
 * in-flight clone. Scenes and the replay viewer never mount this — every
 * `launchFlight` call there lands instantly instead (see `launchFlight`).
 */
export function FlightLayer(): ReactNode {
  const [clones, setClones] = useState<readonly Clone[]>([]);

  useEffect(() => {
    spawnClone = (clone) => setClones((cs) => [...cs, clone]);
    return () => {
      spawnClone = null;
    };
  }, []);

  // Stable identity, or every spawn re-runs every airborne clone's animation
  // effect (see FlightClone's dependency note).
  const remove = useCallback(
    (id: number): void => setClones((cs) => cs.filter((c) => c.id !== id)),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[49]">
      {clones.map((clone) => (
        <FlightClone key={clone.id} clone={clone} onDone={remove} />
      ))}
    </div>
  );
}
