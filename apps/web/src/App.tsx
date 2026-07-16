import { useEffect, useState } from 'react';
import { sendLocalAction, startLocalGame, stopLocalGame } from './local/localGame.js';
import { connect, disconnect, send } from './net/socket.js';
import { leaveVoice } from './voice/rtc.js';
import { History } from './screens/History.js';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { Replay } from './screens/Replay.js';
import { Scenes } from './screens/Scenes.js';
import { Table } from './screens/Table.js';
import { useGameStore } from './state/gameStore.js';

type Route =
  | { kind: 'home' }
  | { kind: 'practice'; seed: number | null }
  | { kind: 'room'; code: string }
  | { kind: 'scenes'; id: string | null }
  | { kind: 'history' }
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
  const replay = /^#replay\/([A-Za-z0-9-]{1,64})$/.exec(h);
  if (replay !== null) return { kind: 'replay', gameId: replay[1] as string };
  return { kind: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const started = useGameStore((s) => s.roster?.started ?? false);

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
  if (route.kind === 'replay') {
    return <Replay gameId={route.gameId} onLeave={() => (location.hash = '#history')} />;
  }
  if (route.kind === 'room') {
    return started ? (
      <Table
        online
        onAction={(action) => send({ t: 'action', action })}
        onLeave={() => (location.hash = '')}
        onRematch={() => send({ t: 'start' })}
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
