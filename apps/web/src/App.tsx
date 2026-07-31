import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  LangProvider,
  PixelWave,
  preloadCardArt,
  TrickSweepProvider,
  trickSweepById,
} from '@jaffre/ui';
import { useCurrentLang } from './lang.js';
import { useSpatialNav } from './keys/spatialNav.js';
import {
  BONHOMME_SKIN_EVENT,
  CARD_SKIN_EVENT,
  currentBonhommeSkin,
  overrideCardSkin,
  shownCardSkin,
} from './cosmetics.js';
import { SWEEP_EVENT, currentSweep } from './sweeps.js';
import { overrideFelt } from './felt.js';
import { refreshFoil } from './foils.js';
import { parsePositionHash, type HandPosition } from './replay/position.js';
import { reconcileCosmetics } from './cosmeticsBoot.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { DEV_TOOLS_ENABLED } from './dev/devMode.js';
import { NoticeToast } from './components/NoticeToast.js';
import { Toast } from './components/Toast.js';
import { ProgressToast } from './components/ProgressToast.js';
import type { ProgressMoment } from './progress.js';
import { UpdateToast } from './pwa/UpdateToast.js';
import { sendLocalAction, startLocalGame, stopLocalGame } from './local/localGame.js';
import { connect, disconnect, send } from './net/socket.js';
import { forgetTable } from './net/rooms.js';
import { reportFunnel } from './net/telemetry.js';
import { leaveVoice } from './voice/rtc.js';
// Home and the room/practice Table path are the critical path (first paint,
// and the screen every join/create flow lands on next) and stay eager. Lobby
// is the screen right after Create/Join, so it stays eager too. Every other
// meta/gallery screen is a click or two away from Home — lazy them so their
// weight (cosmetic pickers, replay viewer, dev scene rig, ...) only loads
// when actually visited, instead of bloating the one index chunk every
// visitor downloads.
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { useGameStore } from './state/gameStore.js';
import { useMusicStore } from './state/musicStore.js';
import { MusicDock } from './music/MusicDock.js';

/**
 * The felt is lazy but WARMED, not eager.
 *
 * It used to be a static import, on the reasoning that the table is the screen
 * every join/create flow lands on. But it is never the FIRST screen — Home is —
 * and measured, the table's chunk (the help tree, the recap, the coach, the
 * login/settings sheets, react-aria's listbox and framer-motion's drag) was a
 * fifth of everything a first-time visitor downloaded before seeing the title.
 * `warmTable()` below pulls it in on idle right after Home paints, so the Play
 * click still finds it in the module cache — the same trick this file already
 * uses for card art.
 */
const Table = lazy(() => import('./screens/Table.js').then((m) => ({ default: m.Table })));
const warmTable = () => void import('./screens/Table.js');

const Awards = lazy(() => import('./screens/Awards.js').then((m) => ({ default: m.Awards })));
const Leaderboard = lazy(() =>
  import('./screens/Leaderboard.js').then((m) => ({ default: m.Leaderboard })),
);
const PublicLobby = lazy(() =>
  import('./screens/PublicLobby.js').then((m) => ({ default: m.PublicLobby })),
);
const Collection = lazy(() =>
  import('./screens/Collection.js').then((m) => ({ default: m.Collection })),
);
const Corner = lazy(() => import('./screens/Corner.js').then((m) => ({ default: m.Corner })));
const Journey = lazy(() => import('./screens/Journey.js').then((m) => ({ default: m.Journey })));
const PaintStudio = lazy(() =>
  import('./screens/PaintStudio.js').then((m) => ({ default: m.PaintStudio })),
);
const DealBoard = lazy(() =>
  import('./screens/DealBoard.js').then((m) => ({ default: m.DealBoard })),
);
const Hand = lazy(() => import('./screens/Hand.js').then((m) => ({ default: m.Hand })));
const HeadToHead = lazy(() =>
  import('./screens/HeadToHead.js').then((m) => ({ default: m.HeadToHead })),
);
const Replay = lazy(() => import('./screens/Replay.js').then((m) => ({ default: m.Replay })));
const Scenes = lazy(() => import('./screens/Scenes.js').then((m) => ({ default: m.Scenes })));
const Stats = lazy(() => import('./screens/Stats.js').then((m) => ({ default: m.Stats })));
const Visitor = lazy(() => import('./screens/Visitor.js').then((m) => ({ default: m.Visitor })));

/** Home + the five meta screens where a progress reconcile has somewhere to
 * land — Corner's tiles, the Journey ladder, the Collection gallery, the
 * Awards shelf and Stats all read straight from the same snapshot a
 * reconcile refreshes. Deliberately narrower than the mount-time skip list
 * below (which only EXCLUDES room/practice/scenes/hand/daily): landing on,
 * say, a replay or the leaderboard isn't worth a stats re-fetch just to
 * maybe pop a toast nobody asked to see there. */
function isMenuSurface(hash: string): boolean {
  const root = hash.split('/')[0] ?? '';
  return (
    root === '' ||
    root === '#' ||
    root === '#corner' ||
    root === '#journey' ||
    root === '#collection' ||
    root === '#awards' ||
    root === '#stats'
  );
}

/** Several hashchanges can fire in a burst (a stale '#history' rewrite right
 * behind a real navigation, a double-tapped back button) — debounce the
 * re-reconcile so a burst costs one stats fetch, not one per hop. */
const RECONCILE_DEBOUNCE_MS = 400;

/** Minimal Suspense fallback for a lazy route chunk still loading — the same
 * loading idiom every meta screen uses for its own data fetch (PixelWave),
 * just centered on an empty ground so there's no layout jump once the real
 * screen mounts. */
function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-(--color-ap-ground)">
      <PixelWave label="…" />
    </div>
  );
}

type Route =
  /** `badLink` carries the hash we couldn't route, so Home can say so once. */
  | { kind: 'home'; badLink: string | null }
  | { kind: 'practice'; seed: number | null }
  | { kind: 'room'; code: string; watching: boolean }
  | { kind: 'scenes'; id: string | null }
  | { kind: 'corner' }
  | { kind: 'stats' }
  | { kind: 'awards' }
  | { kind: 'journey' }
  | { kind: 'leaderboard' }
  | { kind: 'lobby' }
  /** `focus` names a cosmetic to scroll to and highlight — the destination
   * every "you unlocked X" link points at, so the news leads to the thing. */
  | { kind: 'collection'; focus: string | null }
  | { kind: 'paint' }
  /** One other player's shared record, by their PUBLIC id — the destination
   * every named person in Your record links to. */
  | { kind: 'h2h'; pid: string }
  | { kind: 'replay'; gameId: string }
  /** A shared POSITION — one moment of one game, playable. See
   * replay/position.ts for the link format and why it is action-indexed. */
  | { kind: 'hand'; position: HandPosition }
  | { kind: 'dealboard' };

function parseHash(): Route {
  const h = location.hash;
  if (h === '' || h === '#') return { kind: 'home', badLink: null };
  if (h === '#practice') return { kind: 'practice', seed: null };
  // '#practice/<seed>' pins the deal + bot rng — used by the screenshot gallery.
  const practice = /^#practice\/(\d{1,10})$/.exec(h);
  if (practice !== null) return { kind: 'practice', seed: Number(practice[1]) };
  // '/watch' keeps a spectator's choice IN the URL, so a reload (or a shared
  // link) resumes watching instead of dropping back to the Visitor gate.
  // Mixed case tolerated then lowercased: codes are minted lowercase, but a
  // hand-retyped or auto-capitalized invite must not dead-end on BadLinkNotice
  // (the typed-code form already normalizes; a URL deserves the same).
  const room = /^#room\/([a-zA-Z0-9-]{1,32})(\/watch)?$/.exec(h);
  if (room !== null) {
    return {
      kind: 'room',
      code: (room[1] as string).toLowerCase(),
      watching: room[2] !== undefined,
    };
  }
  // '#scenes[/<id>]' — live-through every game phase instantly (design/dev
  // tool). Gated like the dev console: a real visitor typing the hash gets the
  // unknown-link notice, not the internal 60-scene gallery.
  const scenes = /^#scenes(?:\/([a-z0-9-]{1,40}))?$/.exec(h);
  if (scenes !== null && DEV_TOOLS_ENABLED) return { kind: 'scenes', id: scenes[1] ?? null };
  if (h === '#corner') return { kind: 'corner' };
  // Old links/bookmarks to '#history' land on the record — the games list
  // lives there now. The address bar is rewritten to '#stats' on arrival
  // (see AppRoutes) so the stale hash doesn't survive a copy-paste.
  if (h === '#history') return { kind: 'stats' };
  if (h === '#stats') return { kind: 'stats' };
  if (h === '#awards') return { kind: 'awards' };
  if (h === '#journey') return { kind: 'journey' };
  if (h === '#leaderboard') return { kind: 'leaderboard' };
  if (h === '#daily') return { kind: 'dealboard' };
  if (h === '#lobby') return { kind: 'lobby' };
  if (h === '#collection') return { kind: 'collection', focus: null };
  const collectionFocus = /^#collection\/([a-z0-9-]{1,32})$/.exec(h);
  if (collectionFocus !== null) return { kind: 'collection', focus: collectionFocus[1] as string };
  if (h === '#paint') return { kind: 'paint' };
  // publicId's own shape (16 hex) — anything else is a broken link, not a
  // player, and falls through to the unknown-link notice below.
  const h2h = /^#h2h\/([0-9a-f]{16})$/.exec(h);
  if (h2h !== null) return { kind: 'h2h', pid: h2h[1] as string };
  const replay = /^#replay\/([A-Za-z0-9-]{1,64})$/.exec(h);
  if (replay !== null) return { kind: 'replay', gameId: replay[1] as string };
  const position = parsePositionHash(h);
  if (position !== null) return { kind: 'hand', position };
  // Anything else — a typo'd deep link, a stale bookmark, a dead room code —
  // still lands on Home, but says so rather than silently pretending.
  return { kind: 'home', badLink: h };
}

export function App() {
  const lang = useCurrentLang();
  // Arrow keys move focus anywhere in the app, Enter activates what's focused.
  // Mounted once, here, because it reads the live DOM rather than a registry:
  // no screen and no button has to know it exists. Desktop only.
  useSpatialNav();
  // The SHOWN card skin — the viewer's equip, or the table-style override
  // while one is active (shownCardSkin resolves that; both applyCardSkin and
  // overrideCardSkin fire the same event). Kept in sync so a swap re-renders
  // the cards in place (the provider sits above every animated card).
  const [cardSkin, setCardSkin] = useState(shownCardSkin());
  useEffect(() => {
    const onChange = () => setCardSkin(shownCardSkin());
    window.addEventListener(CARD_SKIN_EVENT, onChange);
    // Re-sync once now: a descendant's mount effect (e.g. the scene viewer
    // forcing a card skin) can fire CARD_SKIN_EVENT before this listener is
    // attached — child effects run before the parent's. Reading the current
    // value here catches that missed initial change.
    onChange();
    return () => window.removeEventListener(CARD_SKIN_EVENT, onChange);
  }, []);
  // The bonhomme-art preference — a third, independent axis. Mirrors the card
  // skin's own subscribe/re-sync pattern above (same reasoning applies).
  const [bonhommes, setBonhommes] = useState(currentBonhommeSkin());
  useEffect(() => {
    const onChange = () => setBonhommes(currentBonhommeSkin());
    window.addEventListener(BONHOMME_SKIN_EVENT, onChange);
    onChange();
    return () => window.removeEventListener(BONHOMME_SKIN_EVENT, onChange);
  }, []);
  const skin = useMemo(
    () => ({ id: cardSkin, renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {}, bonhommes }),
    [cardSkin, bonhommes],
  );
  // The trick-sweep variant — a fifth axis, motion rather than tokens. Same
  // subscribe/re-sync pattern as the two above, and for the same reason: it
  // must sit ABOVE every animated card so a swap never remounts one mid-flight.
  const [sweepId, setSweepId] = useState(currentSweep());
  useEffect(() => {
    const onChange = () => setSweepId(currentSweep());
    window.addEventListener(SWEEP_EVENT, onChange);
    onChange();
    return () => window.removeEventListener(SWEEP_EVENT, onChange);
  }, []);
  // I1 — table-style house rule: while the room we're in has it 'host',
  // every seat (including spectators) sees the HOST's felt+sweep — and card
  // skin, when their client sent one — instead of their own; Roster.tableStyle
  // carries the set (messages.ts). Narrow selector on purpose: it resolves to
  // the SAME `null` reference on every roster broadcast whenever the rule is
  // 'own' (the common case), so a table running with the rule off never
  // re-renders App over this.
  // The felt and skin sides are VIEW OVERRIDES ONLY (overrideFelt /
  // overrideCardSkin, never the apply* twins, which persist — see their own
  // comments for why that would be wrong here). The sweep side needed no such
  // care: it was already a pure prop feeding TrickSweepProvider below, so
  // "prefer the table's" is just picking a different id. All fall back to
  // "mine" the instant the rule or the roster goes away — leaving a room
  // resets the store to `roster: null` — which is the whole point: nobody's
  // own cosmetic choice is ever touched by someone else's table.
  const tableStyle = useGameStore((s) =>
    s.roster?.rules?.tableStyle === 'host' ? (s.roster.tableStyle ?? null) : null,
  );
  useEffect(() => {
    overrideFelt(tableStyle?.felt ?? null);
  }, [tableStyle?.felt]);
  useEffect(() => {
    // A host on a pre-skin build sends felt+sweep with no skin: the ?? null
    // keeps the viewer's own cards in that case, same rule as 'own'.
    overrideCardSkin(tableStyle?.skin ?? null);
  }, [tableStyle?.skin]);
  const sweep = useMemo(
    () => trickSweepById(tableStyle?.sweep ?? sweepId),
    [tableStyle?.sweep, sweepId],
  );

  // Warm the equipped cosmetics' card art (the OG portraits/emblems are real
  // JPGs) as soon as we know what's equipped, and again on every swap — so the
  // first Red 0 of a game is already decoded when it lands, instead of
  // starting its fetch at that moment. Fetches nothing for skins with no art.
  // A foil belongs to ONE skin, so equipping a different deck must drop (or
  // pick up) the sheen. Cheap: it reads the grants the boot reconcile already
  // fetched, and no-ops before that has happened.
  useEffect(() => {
    refreshFoil(cardSkin);
  }, [cardSkin]);

  useEffect(() => {
    preloadCardArt(cardSkin, bonhommes);
  }, [cardSkin, bonhommes]);

  // Pull the felt's chunk in once the app is idle, so it is already in the
  // module cache by the time anyone presses Play (see `warmTable`). Idle, not
  // eager: this must never compete with the first paint it exists to protect.
  useEffect(() => {
    const hasRic = typeof window.requestIdleCallback === 'function';
    const handle = hasRic ? window.requestIdleCallback(warmTable) : window.setTimeout(warmTable, 1);
    return () => {
      if (hasRic) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  // Once per load, AND again on every navigation into a menu surface:
  // reconcile cosmetics with real stats — degrade a now-locked choice and
  // surface freshly play-unlocked skins/themes/levels/awards as a toast.
  // Skipped mid-game (room/practice/scenes/hand/daily): reconciling there is
  // pointless, and its stats fetch has no business competing with a live
  // room's socket.
  const [moments, setMoments] = useState<readonly ProgressMoment[]>([]);
  useEffect(() => {
    let live = true;
    const hasRic = typeof window.requestIdleCallback === 'function';
    // Tracks only the MOST RECENT idle/timeout handle — every earlier one
    // either already fired or is superseded by the debounce below, so there
    // is never more than one pending at a time to leak.
    let idleHandle: number | undefined;
    let debounceHandle: number | undefined;

    // Never blocks UI (it only ever surfaces an unlock toast) — defer it off
    // the critical first-paint/hydration path onto idle time, with a
    // setTimeout fallback for browsers without requestIdleCallback (Safari).
    const runReconcile = () => {
      const fire = () => {
        void reconcileCosmetics(lang).then((found) => {
          if (live && found.length > 0) setMoments(found);
        });
      };
      idleHandle = hasRic ? window.requestIdleCallback(fire) : window.setTimeout(fire, 1);
    };

    // `#hand` belongs on this list too: a shared position runs a real
    // practice game, so it is "mid-game" for exactly the same reasons as
    // #practice.
    const midGame = (h: string): boolean =>
      h.startsWith('#room') ||
      h.startsWith('#practice') ||
      h.startsWith('#scenes') ||
      h.startsWith('#hand') ||
      h === '#daily';

    // Mount-time run: whatever hash a fresh load or deep link landed on,
    // as long as it isn't mid-game.
    if (!midGame(location.hash)) runReconcile();

    // Re-run on navigation INTO a menu surface: finishing a room game can
    // level you up, earn an award or drop a foil, and wandering back to
    // Corner/Journey/Collection/Awards/Stats/Home should show that news
    // without waiting on a full reload. Debounced (see RECONCILE_DEBOUNCE_MS).
    const onHash = () => {
      if (!isMenuSurface(location.hash)) return;
      if (debounceHandle !== undefined) window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(runReconcile, RECONCILE_DEBOUNCE_MS);
    };
    window.addEventListener('hashchange', onHash);

    return () => {
      live = false;
      window.removeEventListener('hashchange', onHash);
      if (debounceHandle !== undefined) window.clearTimeout(debounceHandle);
      if (idleHandle !== undefined) {
        if (hasRic) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, []);

  return (
    <LangProvider lang={lang}>
      <CardSkinProvider value={skin}>
        <TrickSweepProvider value={sweep}>
          {/* J1: one online/offline listener for the whole app, above every
            screen — offline is a state the app admits rather than one that
            just silently breaks whatever network call was mid-flight. */}
          <OfflineBanner />
          {/* Mounted first (renders/commits before AppRoutes) so it wins the
            NoticeToast module-level ownership claim over Table's/Lobby's own
            local mounts — see NoticeToast.tsx. This is the app-wide toast
            surface: award grants (and any other net-layer notice) show here
            regardless of which screen is active. */}
          <NoticeToast />
          {/* A render crash lands on a localized fallback (kept inside the
            providers so it stays themed) instead of a white screen. */}
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
          {/* Registers the SW; skipped under automation so e2e never caches. */}
          {!navigator.webdriver && <UpdateToast />}
          {moments.length > 0 && <ProgressToast moments={moments} onDone={() => setMoments([])} />}
        </TrickSweepProvider>
      </CardSkinProvider>
    </LangProvider>
  );
}

/**
 * A dead deep link used to dump you on Home with no explanation. One toast
 * says what happened, and the bad hash is cleared so a reload doesn't repeat
 * it (replaceState — the broken URL has no business in the back stack).
 */
function BadLinkNotice() {
  const lang = useCurrentLang();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    history.replaceState(null, '', location.pathname + location.search);
  }, []);
  if (!shown) return null;
  return (
    <Toast
      message={
        lang === 'fr'
          ? 'Ce lien ne mène nulle part — retour à l’accueil.'
          : "That link doesn't go anywhere — took you home."
      }
      durationMs={4000}
      onDone={() => setShown(false)}
    />
  );
}

/**
 * Give the seat up for good: tell the room, drop the table from "Your tables",
 * and go Home. The counterpart to the plain Home exit, which keeps both — the
 * two live side by side in the lobby, the table's Options drawer and the recap,
 * and must never be confused for one another.
 */
function leaveTableFor(code: string): () => void {
  return () => {
    send({ t: 'leave' });
    forgetTable(code);
    location.hash = '';
  };
}

/**
 * The hash we were on before the current one, for the ONE screen whose exit
 * depends on where you came from: a replay opened from a head-to-head should go
 * back to that head-to-head, not to the record (every other shared-game list
 * lives on the record, so that stays the default). Module-level and deliberately
 * not state — nothing renders from it, and a reload legitimately forgets it.
 */
let previousHash = '';

function AppRoutes() {
  const [route, setRoute] = useState<Route>(parseHash());
  const started = useGameStore((s) => s.roster?.started ?? false);
  const viewer = useGameStore((s) => s.viewer);
  // Counts navigations, so the dead-link notice can remount even when the SAME
  // bad hash is pasted twice (its own replaceState fires no hashchange, so the
  // route object alone never changes and the toast would stay silent).
  const [navSeq, setNavSeq] = useState(0);

  useEffect(() => {
    const onHash = (e: HashChangeEvent) => {
      previousHash = new URL(e.oldURL).hash;
      setRoute(parseHash());
      setNavSeq((n) => n + 1);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Stale '#history' links resolve to the record — rewrite the address bar so
  // the dead hash isn't what gets bookmarked or shared onward. replaceState
  // (not an assignment) keeps it out of the back stack.
  useEffect(() => {
    if (location.hash === '#history') history.replaceState(null, '', '#stats');
  }, [route]);

  // Keyed on the identity of the thing being connected to, NOT the route
  // object: '#room/x' → '#room/x/watch' is the same socket, and re-running
  // here would drop and re-open the connection mid-game.
  const roomCode = route.kind === 'room' ? route.code : null;
  const practiceSeed = route.kind === 'practice' ? route.seed : null;
  const inPractice = route.kind === 'practice';

  useEffect(() => {
    if (!inPractice) return undefined;
    startLocalGame(practiceSeed ?? undefined);
    reportFunnel('start', 'practice');
    return () => stopLocalGame();
  }, [inPractice, practiceSeed]);

  // A room always opens on an EMPTY store, before the browser paints. Practice,
  // the daily deal and the replay viewer all publish through this same store,
  // and their roster says `started: true` — so a room entered right after one of
  // them read as "game already underway" and flashed the felt table for a beat
  // before the socket's welcome arrived and the seat picker took over. This is a
  // LAYOUT effect on purpose: the connect effect below is passive and runs after
  // paint, which is exactly one frame too late to stop the flash.
  useLayoutEffect(() => {
    if (roomCode !== null) useGameStore.getState().reset();
  }, [roomCode]);

  useEffect(() => {
    if (roomCode === null) return undefined;
    connect(roomCode);
    reportFunnel('start', 'online');
    return () => {
      // Tear the voice mesh down at the room boundary — it persists across the
      // lobby→table remount, so leaving from either must clean it up. Music
      // follows the same rule: the dock outlives the screens, not the room.
      leaveVoice();
      disconnect();
      useGameStore.getState().reset();
      useMusicStore.getState().reset();
    };
  }, [roomCode]);

  let content: ReactElement;
  if (route.kind === 'practice') {
    content = (
      <Table
        dev
        tutorial
        practiceSeed={route.seed}
        onAction={sendLocalAction}
        onLeave={() => (location.hash = '')}
        onRematch={() => startLocalGame()}
      />
    );
  } else if (route.kind === 'scenes') {
    content = <Scenes sceneId={route.id} onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'corner') {
    content = <Corner onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'stats') {
    content = <Stats onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'awards') {
    content = <Awards onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'journey') {
    content = <Journey onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'leaderboard') {
    content = <Leaderboard onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'lobby') {
    content = (
      <PublicLobby
        onLeave={() => (location.hash = '')}
        onJoin={(code) => (location.hash = `#room/${code}`)}
      />
    );
  } else if (route.kind === 'collection') {
    // Same exit as every other meta screen: Home. (The mid-game route into
    // the gallery is the CollectionSheet modal, which never leaves the room.)
    content = <Collection onLeave={() => (location.hash = '')} focus={route.focus} />;
  } else if (route.kind === 'paint') {
    content = <PaintStudio onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'h2h') {
    // Back to the record, not Home: this screen is only ever reached from
    // there, and the tile you tapped is what you want to return to.
    content = <HeadToHead pid={route.pid} onLeave={() => (location.hash = '#stats')} />;
  } else if (route.kind === 'replay') {
    // Back to wherever the game was listed: the record, or the head-to-head
    // whose shared-games list you tapped it from.
    const back = /^#h2h\/[0-9a-f]{16}$/.test(previousHash) ? previousHash : '#stats';
    content = <Replay gameId={route.gameId} onLeave={() => (location.hash = back)} />;
  } else if (route.kind === 'dealboard') {
    content = <DealBoard onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'hand') {
    content = <Hand position={route.position} onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'room') {
    // A spectator arriving at a room already underway (viewer is not a seated
    // number) lands on the Visitor screen first — take over a bot's seat or
    // keep watching — unless they've already chosen to watch.
    // MusicDock wraps EVERY room screen from one mount point: the player
    // iframe never remounts across Visitor→Lobby→Table, so the room's music
    // plays on without a gap through seat picking and game start.
    const screen =
      started && typeof viewer !== 'number' && !route.watching ? (
        <Visitor
          code={route.code}
          onSit={(seat) => send({ t: 'sit', seat })}
          // The choice goes in the URL, so a reload resumes watching.
          onWatch={() => (location.hash = `#room/${route.code}/watch`)}
          onLeave={() => (location.hash = '')}
        />
      ) : started ? (
        <Table
          online
          dev
          roomCode={route.code}
          onAction={(action) => send({ t: 'action', action })}
          // Spectators: drop the /watch suffix to get the takeover gate back.
          onTakeSeat={() => (location.hash = `#room/${route.code}`)}
          // Recap "Add a bot" on a vacated seat (Wave 1a client half; the
          // server accepts add_bot between games from Wave 1b on). Seat is
          // always one of the four table positions — the recap only ever
          // calls this with an index from its own [0,1,2,3] seat map.
          onAddBot={(seat) => send({ t: 'add_bot', seat: seat as 0 | 1 | 2 | 3 })}
          onLeave={() => (location.hash = '')}
          onLeaveTable={leaveTableFor(route.code)}
          onRematch={() => send({ t: 'start' })}
          // One click: re-pair the teams AND deal the next game. The DO handles
          // messages in order, so start sees the swapped seating.
          onSwapSeats={() => {
            send({ t: 'swap_seats' });
            send({ t: 'start' });
          }}
          onToggleAutoPlay={(on) => send({ t: 'set_autoplay', on })}
        />
      ) : (
        <Lobby
          code={route.code}
          onLeave={() => (location.hash = '')}
          onLeaveTable={leaveTableFor(route.code)}
        />
      );
    content = (
      <>
        <MusicDock />
        {screen}
      </>
    );
  } else {
    content = (
      <>
        {route.badLink !== null && <BadLinkNotice key={`${route.badLink}:${String(navSeq)}`} />}
        <Home
          onPractice={() => (location.hash = '#practice')}
          onJoinRoom={(code) => (location.hash = `#room/${code}`)}
        />
      </>
    );
  }
  return <Suspense fallback={<RouteFallback />}>{content}</Suspense>;
}
