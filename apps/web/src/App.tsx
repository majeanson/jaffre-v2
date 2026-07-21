import { useEffect, useMemo, useState } from 'react';
import { CardSkinProvider, CARD_SKIN_RENDERERS, LangProvider } from '@jaffre/ui';
import { useCurrentLang } from './lang.js';
import { CARD_SKIN_EVENT, currentCardSkin } from './cosmetics.js';
import { reconcileCosmetics } from './cosmeticsBoot.js';
import { Toast } from './components/Toast.js';
import { UpdateToast } from './pwa/UpdateToast.js';
import { sendLocalAction, startLocalGame, stopLocalGame } from './local/localGame.js';
import { connect, disconnect, send } from './net/socket.js';
import { forgetTable } from './net/rooms.js';
import { leaveVoice } from './voice/rtc.js';
import { Collection, collectionReturnHash } from './screens/Collection.js';
import { History } from './screens/History.js';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { PaintStudio } from './screens/PaintStudio.js';
import { Replay } from './screens/Replay.js';
import { Scenes } from './screens/Scenes.js';
import { Stats } from './screens/Stats.js';
import { Table } from './screens/Table.js';
import { Visitor } from './screens/Visitor.js';
import { useGameStore } from './state/gameStore.js';

type Route =
  | { kind: 'home' }
  | { kind: 'practice'; seed: number | null }
  | { kind: 'room'; code: string }
  | { kind: 'scenes'; id: string | null }
  | { kind: 'history' }
  | { kind: 'stats' }
  | { kind: 'collection' }
  | { kind: 'paint' }
  | { kind: 'replay'; gameId: string };

function parseHash(): Route {
  const h = location.hash;
  if (h === '#practice') return { kind: 'practice', seed: null };
  // '#practice/<seed>' pins the deal + bot rng — used by the screenshot gallery.
  const practice = /^#practice\/(\d{1,10})$/.exec(h);
  if (practice !== null) return { kind: 'practice', seed: Number(practice[1]) };
  const room = /^#room\/([a-z0-9-]{1,32})$/.exec(h);
  if (room !== null) return { kind: 'room', code: room[1] as string };
  // '#scenes[/<id>]' — live-through every game phase instantly (design/dev tool).
  const scenes = /^#scenes(?:\/([a-z0-9-]{1,40}))?$/.exec(h);
  if (scenes !== null) return { kind: 'scenes', id: scenes[1] ?? null };
  if (h === '#history') return { kind: 'history' };
  if (h === '#stats') return { kind: 'stats' };
  if (h === '#collection') return { kind: 'collection' };
  if (h === '#paint') return { kind: 'paint' };
  const replay = /^#replay\/([A-Za-z0-9-]{1,64})$/.exec(h);
  if (replay !== null) return { kind: 'replay', gameId: replay[1] as string };
  return { kind: 'home' };
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
  const skin = useMemo(
    () => ({ id: cardSkin, renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {} }),
    [cardSkin],
  );

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
    void reconcileCosmetics().then((fresh) => {
      if (live && fresh.length > 0) setUnlocked(fresh.join(', '));
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <LangProvider lang={lang}>
      <CardSkinProvider value={skin}>
        <AppRoutes />
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

function AppRoutes() {
  const [route, setRoute] = useState<Route>(parseHash());
  const started = useGameStore((s) => s.roster?.started ?? false);
  const viewer = useGameStore((s) => s.viewer);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (route.kind === 'practice') {
      startLocalGame(route.seed ?? undefined);
      return () => stopLocalGame();
    }
    if (route.kind === 'room') {
      connect(route.code);
      setWatching(false);
      return () => {
        // Tear the voice mesh down at the room boundary — it persists across the
        // lobby→table remount, so leaving from either must clean it up.
        leaveVoice();
        disconnect();
        useGameStore.getState().reset();
      };
    }
    return undefined;
  }, [route]);

  if (route.kind === 'practice') {
    return (
      <Table
        dev
        tutorial
        onAction={sendLocalAction}
        onLeave={() => (location.hash = '')}
        onRematch={() => startLocalGame()}
      />
    );
  }
  if (route.kind === 'scenes') {
    return <Scenes sceneId={route.id} onLeave={() => (location.hash = '')} />;
  }
  if (route.kind === 'history') {
    return <History onLeave={() => (location.hash = '')} />;
  }
  if (route.kind === 'stats') {
    return <Stats onLeave={() => (location.hash = '')} />;
  }
  if (route.kind === 'collection') {
    return <Collection onLeave={() => (location.hash = collectionReturnHash())} />;
  }
  if (route.kind === 'paint') {
    return <PaintStudio onLeave={() => (location.hash = '')} />;
  }
  if (route.kind === 'replay') {
    return <Replay gameId={route.gameId} onLeave={() => (location.hash = '#history')} />;
  }
  if (route.kind === 'room') {
    // A spectator arriving at a room already underway (viewer is not a seated
    // number) lands on the Visitor screen first — take over a bot's seat or
    // keep watching — unless they've already chosen to watch.
    if (started && typeof viewer !== 'number' && !watching) {
      return (
        <Visitor
          code={route.code}
          onSit={(seat) => send({ t: 'sit', seat })}
          onWatch={() => setWatching(true)}
          onLeave={() => (location.hash = '')}
        />
      );
    }
    return started ? (
      <Table
        online
        dev
        roomCode={route.code}
        onAction={(action) => send({ t: 'action', action })}
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
  }
  return (
    <Home
      onPractice={() => (location.hash = '#practice')}
      onJoinRoom={(code) => (location.hash = `#room/${code}`)}
    />
  );
}
