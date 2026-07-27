import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  LangProvider,
  PixelWave,
  preloadCardArt,
} from '@jaffre/ui';
import { useCurrentLang } from './lang.js';
import {
  BONHOMME_SKIN_EVENT,
  CARD_SKIN_EVENT,
  currentBonhommeSkin,
  currentCardSkin,
} from './cosmetics.js';
import { reconcileCosmetics } from './cosmeticsBoot.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { DEV_TOOLS_ENABLED } from './dev/devMode.js';
import { NoticeToast } from './components/NoticeToast.js';
import { Toast } from './components/Toast.js';
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
import { Table } from './screens/Table.js';
import { useGameStore } from './state/gameStore.js';
import { useMusicStore } from './state/musicStore.js';
import { MusicDock } from './music/MusicDock.js';

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
const Replay = lazy(() => import('./screens/Replay.js').then((m) => ({ default: m.Replay })));
const Scenes = lazy(() => import('./screens/Scenes.js').then((m) => ({ default: m.Scenes })));
const Stats = lazy(() => import('./screens/Stats.js').then((m) => ({ default: m.Stats })));
const Visitor = lazy(() => import('./screens/Visitor.js').then((m) => ({ default: m.Visitor })));

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
  | { kind: 'collection' }
  | { kind: 'paint' }
  | { kind: 'replay'; gameId: string };

function parseHash(): Route {
  const h = location.hash;
  if (h === '' || h === '#') return { kind: 'home', badLink: null };
  if (h === '#practice') return { kind: 'practice', seed: null };
  // '#practice/<seed>' pins the deal + bot rng — used by the screenshot gallery.
  const practice = /^#practice\/(\d{1,10})$/.exec(h);
  if (practice !== null) return { kind: 'practice', seed: Number(practice[1]) };
  // '/watch' keeps a spectator's choice IN the URL, so a reload (or a shared
  // link) resumes watching instead of dropping back to the Visitor gate.
  const room = /^#room\/([a-z0-9-]{1,32})(\/watch)?$/.exec(h);
  if (room !== null) {
    return { kind: 'room', code: room[1] as string, watching: room[2] !== undefined };
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
  if (h === '#lobby') return { kind: 'lobby' };
  if (h === '#collection') return { kind: 'collection' };
  if (h === '#paint') return { kind: 'paint' };
  const replay = /^#replay\/([A-Za-z0-9-]{1,64})$/.exec(h);
  if (replay !== null) return { kind: 'replay', gameId: replay[1] as string };
  // Anything else — a typo'd deep link, a stale bookmark, a dead room code —
  // still lands on Home, but says so rather than silently pretending.
  return { kind: 'home', badLink: h };
}

export function App() {
  const lang = useCurrentLang();
  // The active card skin, kept in sync with applyCardSkin() so a swap re-renders
  // the cards in place (the provider sits above every animated card).
  const [cardSkin, setCardSkin] = useState(currentCardSkin());
  useEffect(() => {
    const onChange = () => setCardSkin(currentCardSkin());
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

  // Warm the equipped cosmetics' card art (the OG portraits/emblems are real
  // JPGs) as soon as we know what's equipped, and again on every swap — so the
  // first Red 0 of a game is already decoded when it lands, instead of
  // starting its fetch at that moment. Fetches nothing for skins with no art.
  useEffect(() => {
    preloadCardArt(cardSkin, bonhommes);
  }, [cardSkin, bonhommes]);

  // Once per load: reconcile cosmetics with real stats — degrade a now-locked
  // choice and surface freshly play-unlocked skins/themes as a toast. Skipped in
  // the scene viewer (a dev tool that shouldn't hit the network or pop toasts).
  const [unlocked, setUnlocked] = useState<string | null>(null);
  useEffect(() => {
    // Only on menu screens: reconciling mid-game is pointless, and its stats
    // fetch has no business competing with a live room's socket. (`#scenes` is a
    // dev tool that shouldn't hit the network or pop toasts either.)
    const h = location.hash;
    if (h.startsWith('#room') || h.startsWith('#practice') || h.startsWith('#scenes')) return;
    let live = true;
    // Never blocks UI (it only ever surfaces an unlock toast) — defer it off
    // the critical first-paint/hydration path onto idle time, with a
    // setTimeout fallback for browsers without requestIdleCallback (Safari).
    const runReconcile = () => {
      void reconcileCosmetics().then((fresh) => {
        if (live && fresh.length > 0) setUnlocked(fresh.join(', '));
      });
    };
    const hasRic = typeof window.requestIdleCallback === 'function';
    const handle = hasRic
      ? window.requestIdleCallback(runReconcile)
      : window.setTimeout(runReconcile, 1);
    return () => {
      live = false;
      if (hasRic) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return (
    <LangProvider lang={lang}>
      <CardSkinProvider value={skin}>
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
        {unlocked !== null && (
          <Toast
            message={`${lang === 'fr' ? 'Débloqué : ' : 'Unlocked: '}${unlocked}`}
            durationMs={3500}
            onDone={() => setUnlocked(null)}
          />
        )}
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

function AppRoutes() {
  const [route, setRoute] = useState<Route>(parseHash());
  const started = useGameStore((s) => s.roster?.started ?? false);
  const viewer = useGameStore((s) => s.viewer);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
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
    content = <Collection onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'paint') {
    content = <PaintStudio onLeave={() => (location.hash = '')} />;
  } else if (route.kind === 'replay') {
    content = <Replay gameId={route.gameId} onLeave={() => (location.hash = '#stats')} />;
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
          onLeave={() => (location.hash = '')}
          onLeaveTable={() => {
            // Recap "Leave": give the seat up for good (the top-bar leave stays a
            // soft hop — seat kept, resume from "Your tables").
            send({ t: 'leave' });
            forgetTable(route.code);
            location.hash = '';
          }}
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
        <Lobby code={route.code} onLeave={() => (location.hash = '')} />
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
        {route.badLink !== null && <BadLinkNotice key={route.badLink} />}
        <Home
          onPractice={() => (location.hash = '#practice')}
          onJoinRoom={(code) => (location.hash = `#room/${code}`)}
        />
      </>
    );
  }
  return <Suspense fallback={<RouteFallback />}>{content}</Suspense>;
}
