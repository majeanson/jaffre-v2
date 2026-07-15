import { useEffect, useState } from 'react';
import { sendLocalAction, startLocalGame, stopLocalGame } from './local/localGame.js';
import { connect, disconnect, send } from './net/socket.js';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { Table } from './screens/Table.js';
import { useGameStore } from './state/gameStore.js';

type Route =
  { kind: 'home' } | { kind: 'practice'; seed: number | null } | { kind: 'room'; code: string };

function parseHash(): Route {
  const h = location.hash;
  if (h === '#practice') return { kind: 'practice', seed: null };
  // '#practice/<seed>' pins the deal + bot rng — used by the screenshot gallery.
  const practice = /^#practice\/(\d{1,10})$/.exec(h);
  if (practice !== null) return { kind: 'practice', seed: Number(practice[1]) };
  const room = /^#room\/([a-z0-9-]{1,32})$/.exec(h);
  if (room !== null) return { kind: 'room', code: room[1] as string };
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
