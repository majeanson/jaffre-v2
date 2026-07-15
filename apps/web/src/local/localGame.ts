import type { Action, GameState, Rng } from '@jaffre/engine';
import { applyAction, createGame, mulberry32, viewFor } from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import type { ClientAction } from '@jaffre/protocol';
import type { Roster } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';

/**
 * Practice mode: the whole game runs in this tab. The store still only ever
 * sees redacted views + events — exactly the shape the server sends — so the
 * Table screen cannot tell local from online play.
 */

const BOT_NAMES = ['Marcel', 'Ginette', 'Réal'] as const;
const HUMAN_SEAT = 0 as const;

let state: GameState | null = null;
let rng: Rng = mulberry32(0);
let botTimer: ReturnType<typeof setTimeout> | null = null;

const LOCAL_ROSTER: Roster = {
  seats: [
    { name: 'You', isBot: false, connected: true },
    { name: BOT_NAMES[0], isBot: true, connected: true },
    { name: BOT_NAMES[1], isBot: true, connected: true },
    { name: BOT_NAMES[2], isBot: true, connected: true },
  ],
  spectators: 0,
  started: true,
};

export function startLocalGame(): void {
  stopLocalGame();
  const seed = Math.floor(Math.random() * 2 ** 31);
  state = createGame(seed);
  rng = mulberry32(seed ^ 0xb07);
  const store = useGameStore.getState();
  store.reset();
  store.welcome(HUMAN_SEAT, viewFor(state, HUMAN_SEAT), 0, LOCAL_ROSTER, []);
  scheduleBots();
}

export function stopLocalGame(): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  state = null;
}

export function sendLocalAction(action: ClientAction): void {
  if (state === null) return;
  const stamped: Action =
    action.type === 'continue' ? action : ({ ...action, seat: HUMAN_SEAT } as Action);
  apply(stamped);
}

function apply(action: Action): void {
  if (state === null) return;
  const result = applyAction(state, action);
  if (!result.ok) return; // UI only offers legal moves; ignore rejects
  state = result.state;
  const store = useGameStore.getState();
  store.applyEvents(result.events, store.seq + 1, viewFor(state, HUMAN_SEAT));
  scheduleBots();
}

function scheduleBots(): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  if (state === null || state.phase === 'game_over') return;
  const isBotTurn = state.turn !== HUMAN_SEAT;
  const isPause = state.phase === 'round_over';
  if (!isBotTurn && !isPause) return;
  botTimer = setTimeout(
    () => {
      if (state === null) return;
      const action =
        state.phase === 'round_over'
          ? ({ type: 'continue' } as const)
          : chooseAction(viewFor(state, state.turn), rng);
      if (action !== null) apply(action);
    },
    state.phase === 'round_over' ? 2600 : 750,
  );
}
