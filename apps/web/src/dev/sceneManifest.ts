/**
 * Scene catalog metadata — pure data, NO runtime imports (type-only allowed):
 * the Playwright scenes spec imports this from node, so pulling in React or
 * the store here would drag the whole app into the test runner.
 */

export type SceneScreen =
  | 'table'
  | 'home'
  | 'corner'
  | 'lobby'
  | 'stats'
  | 'replay'
  | 'hand'
  | 'dealboard'
  | 'visitor'
  | 'share'
  | 'collection'
  | 'journey'
  | 'paint'
  | 'public-lobby'
  | 'awards'
  | 'leaderboard';

/** UI panels a scene wants open on mount (applied as initial state). */
export interface SceneUi {
  readonly logOpen?: boolean;
  readonly scoreDetailsOpen?: boolean;
  readonly lastTrickOpen?: boolean;
  readonly chatOpen?: boolean;
  readonly helpOpen?: boolean;
  readonly playOpen?: boolean;
  /** Home only: mount with the Customize sheet open (live/editable variant). */
  readonly customizeOpen?: boolean;
  /** Home only: mount with the Login sheet open. */
  readonly loginOpen?: boolean;
  /** Table comms popover: which tab starts active (default 'chat'). */
  readonly commsTab?: 'music';
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
  /** Force a language for this scene (default: the stored one, i.e. EN);
   * applied on mount and restored on exit — for FR width/wrap coverage. */
  readonly lang?: 'fr';
  /** Force a card skin for this scene (default: the stored one, i.e. arcade). */
  readonly cardSkin?: string;
  /** Force a felt for this scene (default: the stored one, i.e. house). The
   * felt is the largest single area on the table, so the sweep needs at least
   * one dark and one LIGHT surface to catch foreground-contrast regressions. */
  readonly felt?: string;
  /** Seed the viewer's painted-card cosmetic (data URL) for this scene, so the
   * personalised avatar + own 0-cards render; restored to the real one on exit. */
  readonly paint?: string;
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
    ui: { playOpen: true },
    probe: 'role=button[name="Resume"]',
  },
  {
    id: 'home-play-open',
    label: 'Home — play door open (resume / bots / public / private)',
    screen: 'home',
    ui: { playOpen: true },
    probe: 'role=button[name="Play vs bots"]',
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
    probe: 'text=seats left — add bots',
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
    // Off-turn the auction panel STAYS up (everyone follows the bidding) with
    // every card locked — so the probe is the disabled Pass card, and no
    // enabled one may exist.
    probe: 'role=button[name="Pass"][disabled=true]',
    absent: 'role=button[name="Pass"][disabled=false]',
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
    id: 'seat-away-bot-playing',
    label: 'Opponent away past the deadline — bot playing',
    screen: 'table',
    probe: '[data-testid="botplaying-badge"]',
  },
  {
    id: 'seat-turntimer-nudge',
    label: 'Opponent idle on turn — turn-timer nudge',
    screen: 'table',
    probe: '[data-testid="turntimer-countdown"]',
  },
  {
    id: 'seat-turntimer-you',
    label: 'Your turn idle — I’m-here nudge',
    screen: 'table',
    probe: 'button[data-testid="turntimer-countdown"]',
  },
  {
    id: 'seat-autoplay-badge',
    label: 'Opponent on auto-play — bot playing',
    screen: 'table',
    probe: '[data-testid="autoplay-badge"]',
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
    id: 'round-over-timeout',
    label: 'Round summary — auto-ready countdown',
    screen: 'table',
    probe: '[data-testid="ready-countdown"]',
  },
  {
    id: 'game-over',
    label: 'Game over — recap',
    screen: 'table',
    probe: 'role=button[name="Rematch"]',
  },
  {
    id: 'corner',
    label: 'Your corner — overview',
    screen: 'corner',
    probe: 'text=Latest award',
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
    probe: 'text=Your games',
  },
  {
    id: 'stats-loading',
    label: 'Your record — loading',
    screen: 'stats',
    probe: 'text=Dealing…',
  },
  {
    id: 'stats-all-games',
    label: 'Your record — all games',
    screen: 'stats',
    probe: 'a[href="#replay/demo-1"]',
  },
  {
    id: 'replay',
    label: 'Replay viewer',
    screen: 'replay',
    probe: '[data-testid="replay-controls"]',
  },
  {
    // The receiving end of a shared hand. Hand.tsx has always taken staged
    // replay data for exactly this, but nothing wired it up — so the screen a
    // stranger lands on from someone else's link had no scene, no shot in the
    // gallery, and no way to be tested without first playing a whole game to
    // game_over against the real server.
    id: 'hand',
    label: 'Check this play — a shared position',
    screen: 'hand',
    probe: 'role=button[name="Play it out"]',
  },
  {
    id: 'daily',
    label: 'Deal Board — today, already played',
    screen: 'dealboard',
    probe: 'role=heading[name="Deal Board"]',
  },
  {
    // The FR twin exists for the tab row specifically: four deal tabs whose
    // French labels ("La main du jour", "Donne 1…3") are markedly longer than
    // the English, on the narrowest viewport the sweep shoots.
    id: 'daily-fr',
    label: 'Deal Board — French (tab row width)',
    screen: 'dealboard',
    lang: 'fr',
    probe: 'role=heading[name="Tableau des donnes"]',
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
    id: 'journey',
    label: 'Journey — level track',
    screen: 'journey',
    probe: 'role=heading[name="Journey"]',
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
  {
    id: 'felt-tavern',
    label: 'Play — Tavern Wood felt',
    screen: 'table',
    felt: 'tavern',
    probe: '[role="option"][data-playable="true"]',
  },
  {
    id: 'felt-rink',
    label: 'Play — Rink Ice felt (light surface)',
    screen: 'table',
    felt: 'rink',
    probe: '[role="option"][data-playable="true"]',
  },
  {
    id: 'felt-arborite-light',
    label: 'Play — Kitchen Arborite felt on the light theme',
    screen: 'table',
    felt: 'arborite',
    theme: 'light',
    probe: '[role="option"][data-playable="true"]',
  },
  {
    id: 'painted-card',
    label: 'Play — your painted card (avatar + own 0s)',
    screen: 'table',
    // A 16×16 pixel doodle (the studio's smiley starter) stands in for the
    // player's own avatar, in the same format the Paint Studio saves.
    paint:
      'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20width%3D%2216%22%20height%3D%2216%22%20shape-rendering%3D%22crispEdges%22%3E%3Crect%20x%3D%224%22%20y%3D%221%22%20width%3D%228%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%222%22%20width%3D%2212%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%223%22%20width%3D%2214%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%224%22%20width%3D%2214%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%225%22%20width%3D%2216%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%226%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%226%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%226%22%20width%3D%226%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%226%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%226%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%227%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%227%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%227%22%20width%3D%226%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%227%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%227%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%228%22%20width%3D%2216%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%229%22%20width%3D%2216%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2210%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%2210%22%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%2210%22%20width%3D%2210%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2210%22%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2210%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%2211%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%2211%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%2211%22%20width%3D%228%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%2211%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2211%22%20width%3D%222%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%2212%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%2212%22%20width%3D%228%22%20height%3D%221%22%20fill%3D%22%230b0713%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%2212%22%20width%3D%223%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%2213%22%20width%3D%2214%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%2214%22%20width%3D%2212%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%2215%22%20width%3D%228%22%20height%3D%221%22%20fill%3D%22%23f2b712%22%2F%3E%3C%2Fsvg%3E',
    probe: 'role=listbox[name="Your hand"]',
  },
  {
    id: 'paint-studio',
    label: 'Paint Studio — pixel editor',
    screen: 'paint',
    probe: '[data-testid="pixel-grid"]',
  },
  {
    id: 'public-lobby',
    label: 'Public lobby — open tables',
    screen: 'public-lobby',
    probe: 'role=heading[name="Public tables"]',
  },
  {
    id: 'public-lobby-empty',
    label: 'Public lobby — no tables',
    screen: 'public-lobby',
    probe: 'role=heading[name="Public tables"]',
    absent: 'role=button[name="Join"]',
  },
  {
    id: 'awards',
    label: 'Awards — some earned',
    screen: 'awards',
    probe: 'role=heading[name="Awards"]',
  },
  {
    id: 'awards-fresh',
    label: 'Awards — all locked (progress bars)',
    screen: 'awards',
    probe: 'role=heading[name="Awards"]',
  },
  {
    // Arrange mode adds a row of move buttons under every trophy — the state
    // most likely to overflow a narrow shelf, so it gets its own shot.
    id: 'awards-arranging',
    label: 'Awards — trophy shelf, arrange mode',
    screen: 'awards',
    probe: 'role=heading[name="Awards"]',
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard — top 10 + you pinned',
    screen: 'leaderboard',
    probe: 'role=heading[name="Leaderboard"]',
  },
  {
    id: 'leaderboard-empty',
    label: 'Leaderboard — no ranked players',
    screen: 'leaderboard',
    probe: 'text=No ranked players yet',
  },
  {
    id: 'corner-empty',
    label: 'Your corner — brand new player',
    screen: 'corner',
    probe: 'text=No awards yet',
  },
  {
    id: 'journey-new',
    label: 'Journey — brand new player',
    screen: 'journey',
    probe: 'role=heading[name="Journey"]',
  },
  {
    id: 'customize',
    label: 'Customize sheet — palette + paint',
    screen: 'home',
    ui: { customizeOpen: true },
    probe: 'role=dialog[name="Customize"]',
  },
  {
    // "link your account", not "keep your games": the picker option's label
    // otherwise collides with stats.spec's getByText('Your games').
    id: 'login-sheet',
    label: 'Login sheet — link your account',
    screen: 'home',
    ui: { loginOpen: true },
    probe: 'role=dialog[name="Log in"]',
  },
  {
    id: 'music-open',
    label: 'Online table — music queue open',
    screen: 'table',
    online: true,
    ui: { chatOpen: true, commsTab: 'music' },
    probe: '[data-testid="comms-tab-music"][aria-pressed="true"]',
  },
  {
    id: 'visitor-away',
    label: 'Visitor — away human seat (hint)',
    screen: 'visitor',
    probe: 'text=Away seats free up',
  },
  {
    id: 'home-fr',
    label: 'Home — français',
    screen: 'home',
    lang: 'fr',
    probe: 'role=heading[name="Jaffre"]',
  },
  {
    id: 'lobby-open-fr',
    label: 'Lobby — sièges libres (français)',
    screen: 'lobby',
    lang: 'fr',
    probe: 'text=sièges à remplir',
  },
] as const satisfies readonly SceneMeta[];

export type SceneId = (typeof SCENE_METAS)[number]['id'];
