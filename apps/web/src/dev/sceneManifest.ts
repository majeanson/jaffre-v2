/**
 * Scene catalog metadata — pure data, NO runtime imports (type-only allowed):
 * the Playwright scenes spec imports this from node, so pulling in React or
 * the store here would drag the whole app into the test runner.
 */

export type SceneScreen =
  'table' | 'home' | 'lobby' | 'history' | 'stats' | 'replay' | 'visitor' | 'share' | 'collection';

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
  /** Force a skin for this scene (default: the stored theme, i.e. dark). */
  readonly theme?: 'light';
  /** Force a card skin for this scene (default: the stored one, i.e. arcade). */
  readonly cardSkin?: string;
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
    id: 'your-tables',
    label: 'Home — your tables (resume)',
    screen: 'home',
    probe: 'role=button[name="Resume"]',
  },
  {
    id: 'identity',
    label: 'Identity — new player (recovery words)',
    screen: 'home',
    probe: 'text=get your name and games back',
  },
  {
    id: 'identity-light',
    label: 'Identity — light skin',
    screen: 'home',
    theme: 'light',
    probe: 'text=get your name and games back',
  },
  {
    id: 'identity-loading',
    label: 'Identity — minting (shimmer)',
    screen: 'home',
    probe: 'text=Minting your words',
  },
  {
    id: 'identity-recover-error',
    label: 'Identity — code not found',
    screen: 'home',
    probe: "text=That code didn't match",
  },
  {
    id: 'identity-name-taken',
    label: 'Identity — name taken',
    screen: 'home',
    probe: "text=That name's taken",
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
    id: 'follow-suit',
    label: 'Play — follow suit (locked cards)',
    screen: 'table',
    probe: 'role=listbox[name="Your hand"]',
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
    id: 'table-reconnecting',
    label: 'Table — reconnecting',
    screen: 'table',
    online: true,
    probe: '[data-testid="connection-banner"]',
  },
  {
    id: 'seat-disconnected-countdown',
    label: 'Opponent away — bot-swap countdown',
    screen: 'table',
    probe: '[data-testid="botswap-countdown"]',
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
  {
    id: 'history',
    label: 'Your games — history',
    screen: 'history',
    probe: 'role=heading[name="Your games"]',
  },
  {
    id: 'history-empty',
    label: 'Your games — empty',
    screen: 'history',
    probe: 'text=No finished games yet',
  },
  {
    id: 'stats',
    label: 'Your record — stats',
    screen: 'stats',
    probe: 'role=heading[name="Your record"]',
  },
  {
    id: 'stats-empty',
    label: 'Your record — empty',
    screen: 'stats',
    probe: 'text=No games yet',
  },
  {
    id: 'stats-new',
    label: 'Your record — brand new',
    screen: 'stats',
    probe: 'text=no contracts yet',
  },
  {
    id: 'stats-veteran',
    label: 'Your record — veteran',
    screen: 'stats',
    probe: 'text=Recent games',
  },
  {
    id: 'stats-loading',
    label: 'Your record — loading',
    screen: 'stats',
    probe: 'text=Dealing…',
  },
  {
    id: 'replay',
    label: 'Replay viewer',
    screen: 'replay',
    probe: '[data-testid="replay-controls"]',
  },
  {
    id: 'visitor',
    label: 'Visitor — take a bot seat',
    screen: 'visitor',
    probe: '[data-testid="take-seat-1"]',
  },
  {
    id: 'share-sheet',
    label: 'Invite — share sheet',
    screen: 'share',
    probe: 'role=dialog[name="Invite to your table"]',
  },
  {
    id: 'collection',
    label: 'Collection — cosmetics gallery',
    screen: 'collection',
    probe: 'role=heading[name="Collection"]',
  },
  {
    id: 'classic-og-deck',
    label: 'Play — Classic OG card skin',
    screen: 'table',
    cardSkin: 'classic-og',
    probe: '[role="option"][data-playable="true"]',
  },
  {
    id: 'og-deck',
    label: 'Play — full OG deck',
    screen: 'table',
    cardSkin: 'og-deck',
    probe: '[role="option"][data-playable="true"]',
  },
] as const satisfies readonly SceneMeta[];

export type SceneId = (typeof SCENE_METAS)[number]['id'];
