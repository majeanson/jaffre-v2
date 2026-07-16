/**
 * Scene catalog metadata — pure data, NO runtime imports (type-only allowed):
 * the Playwright scenes spec imports this from node, so pulling in React or
 * the store here would drag the whole app into the test runner.
 */

export type SceneScreen = 'table' | 'home' | 'lobby';

/** UI panels a scene wants open on mount (applied as initial state). */
export interface SceneUi {
  readonly logOpen?: boolean;
  readonly scoreDetailsOpen?: boolean;
  readonly lastTrickOpen?: boolean;
  readonly chatOpen?: boolean;
  readonly helpOpen?: boolean;
}

export interface SceneMeta {
  /** Stable id — deep-linkable as '#scenes/<id>'. */
  readonly id: string;
  readonly label: string;
  /** Which shell renders the scene. */
  readonly screen: SceneScreen;
  /** Table only: mounts Comms (chat + voice), as an online room would. */
  readonly online?: boolean;
  /** Keep a held trick on screen indefinitely. */
  readonly frozenHold?: boolean;
  readonly ui?: SceneUi;
  /** Playwright locator that must be visible once the scene renders. */
  readonly probe: string;
  /** Playwright locator that must NOT be visible in this scene. */
  readonly absent?: string;
}

export const SCENE_METAS = [
  {
    id: 'home',
    label: 'Home — title screen',
    screen: 'home',
    probe: 'role=heading[name="Jaffre"]',
  },
  {
    id: 'home-help',
    label: 'Home — how to play',
    screen: 'home',
    ui: { helpOpen: true },
    probe: 'role=dialog[name="How to play"]',
  },
  {
    id: 'lobby-open',
    label: 'Lobby — seats open',
    screen: 'lobby',
    probe: 'role=button[name="Waiting for 4 players…"]',
  },
  {
    id: 'lobby-full',
    label: 'Lobby — ready to start',
    screen: 'lobby',
    probe: 'role=button[name="Start the game"]',
  },
  {
    id: 'lobby-reconnecting',
    label: 'Lobby — reconnecting',
    screen: 'lobby',
    probe: 'text="Reconnecting…"',
  },
  {
    id: 'waiting',
    label: 'Table — waiting for the game',
    screen: 'table',
    probe: 'text="Waiting for the game…"',
  },
  {
    id: 'auction-you',
    label: 'Auction — your turn',
    screen: 'table',
    probe: 'role=button[name="Pass"]',
  },
  {
    id: 'auction-wait',
    label: 'Auction — waiting',
    screen: 'table',
    probe: 'role=listbox[name="Your hand"]',
    absent: 'role=button[name="Pass"]',
  },
  {
    id: 'your-lead',
    label: 'Play — your lead',
    screen: 'table',
    probe: '[role="option"][data-playable="true"]',
  },
  {
    id: 'mid-trick',
    label: 'Play — mid trick',
    screen: 'table',
    probe: '[data-testid="trick-card"]',
  },
  {
    id: 'trick-held',
    label: 'Trick resolved (held)',
    screen: 'table',
    frozenHold: true,
    probe: '[data-testid="trick-banner"]',
  },
  {
    id: 'trick-red-zero',
    label: 'Trick resolved — RED 0!',
    screen: 'table',
    frozenHold: true,
    probe: '[data-testid="trick-banner"] >> text=/RED 0/',
  },
  {
    id: 'last-trick-peek',
    label: 'Last-trick popover',
    screen: 'table',
    ui: { lastTrickOpen: true },
    probe: 'role=button[name="Last trick"][expanded=true]',
  },
  {
    id: 'log-open',
    label: 'Game log open',
    screen: 'table',
    ui: { logOpen: true },
    probe: '[data-testid="game-log"]',
  },
  {
    id: 'score-details',
    label: 'Score details expanded',
    screen: 'table',
    ui: { scoreDetailsOpen: true },
    probe: 'role=button[name="Score details"][expanded=true]',
  },
  {
    id: 'comms-open',
    label: 'Online table — chat open',
    screen: 'table',
    online: true,
    ui: { chatOpen: true },
    probe: '[data-testid="chat-input"]',
  },
  {
    id: 'spectator',
    label: 'Spectator view',
    screen: 'table',
    probe: 'text="Marc"',
    absent: 'role=listbox[name="Your hand"]',
  },
  {
    id: 'round-over',
    label: 'Round summary',
    screen: 'table',
    probe: 'role=button[name="Ready for the next round"]',
  },
  {
    id: 'round-over-ready',
    label: 'Round summary — you are ready',
    screen: 'table',
    probe: 'role=button[name="Waiting for the others…"]',
  },
  {
    id: 'game-over',
    label: 'Game over — recap',
    screen: 'table',
    probe: 'role=button[name="Rematch"]',
  },
] as const satisfies readonly SceneMeta[];

export type SceneId = (typeof SCENE_METAS)[number]['id'];
