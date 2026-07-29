import { useEffect } from 'react';
import {
  DEMO_CHALLENGE_BOARD,
  DEMO_EARNED_AWARDS,
  DEMO_HISTORY,
  DEMO_HISTORY_NEW,
  DEMO_HISTORY_VETERAN,
  DEMO_LEADERBOARD,
  DEMO_MONTHLY,
  DEMO_NOW,
  DEMO_PUBLIC_ROOMS,
  DEMO_REPLAY,
  DEMO_STATS,
  DEMO_STATS_NEW,
  DEMO_STATS_VETERAN,
  DEMO_TABLES,
  SCENES,
} from '../dev/scenes.js';
import { applyCardSkin, currentCardSkin } from '../cosmetics.js';
import { applyFelt, currentFelt } from '../felt.js';
import { overrideLang } from '../lang.js';
import { GHOST_BTN_SM_DARK } from '../components/buttonStyles.js';
import { ShareSheet } from '../components/ShareSheet.js';
import { Awards } from './Awards.js';
import { Collection } from './Collection.js';
import { Leaderboard } from './Leaderboard.js';
import { Corner } from './Corner.js';
import { Journey } from './Journey.js';
import { Home, type IdentityStage } from './Home.js';
import { Lobby } from './Lobby.js';
import { PaintStudio } from './PaintStudio.js';
import { PublicLobby } from './PublicLobby.js';
import { DealBoard } from './DealBoard.js';
import { Hand } from './Hand.js';
import { Replay } from './Replay.js';
import { Stats } from './Stats.js';
import { Table } from './Table.js';
import { Visitor } from './Visitor.js';

/** Mirrors PROFILE_KEY in net/auth.ts — the cached-cosmetics localStorage key. */
const PROFILE_KEY = 'jaffre-profile';

export interface ScenesProps {
  /** Scene id from '#scenes/<id>'; null or unknown falls back to the first. */
  readonly sceneId: string | null;
  readonly onLeave: () => void;
}

const noop = () => undefined;

const goTo = (id: string) => {
  location.hash = `#scenes/${id}`;
};

/** Deterministic staged identities for the home identity scenes. */
const IDENTITY_STAGES: Record<string, IdentityStage> = {
  identity: {
    name: 'Marc',
    color: '#7a6ff0',
    paint: null,
    recovery: { kind: 'code', code: 'lampe-tricot-hibou' },
  },
  'identity-light': {
    name: 'Ginette',
    color: '#f2b712',
    paint: null,
    recovery: { kind: 'code', code: 'renard-flute-cabane' },
  },
  'identity-loading': {
    name: 'Marc',
    color: null,
    paint: null,
    recovery: { kind: 'loading' },
  },
  'identity-recover-error': {
    name: 'Marc',
    color: null,
    paint: null,
    recovery: { kind: 'recover-error' },
  },
  'identity-name-taken': {
    name: 'Marc',
    color: '#e05252',
    paint: null,
    recovery: { kind: 'code', code: 'lampe-tricot-hibou' },
    nameError: "That name's taken here — try another.",
  },
};

/**
 * Owns the scene viewer (#scenes/<id>): live-through every phase and screen
 * of a game instantly — the real components rendering staged engine states,
 * with a floating picker. The hash is the source of truth; actions are inert.
 */
export function Scenes({ sceneId, onLeave }: ScenesProps) {
  const index = Math.max(
    0,
    SCENES.findIndex((s) => s.id === sceneId),
  );
  const current = SCENES[index] ?? SCENES[0];

  useEffect(() => {
    current?.load();
  }, [current]);

  // Some scenes force a theme and/or a card skin (e.g. the light-skin identity
  // variant, the Classic-OG deck scene). Apply on mount and restore on leave.
  // The card skin goes through applyCardSkin so its renderers (framed pips, foil,
  // glow) update too, not just the tokens — restored to the player's own on exit.
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset['theme'];
    const prevSkin = currentCardSkin();
    const prevFelt = currentFelt();
    if (current?.theme === 'light') root.dataset['theme'] = 'light';
    if (current?.cardSkin !== undefined) applyCardSkin(current.cardSkin);
    if (current?.felt !== undefined) applyFelt(current.felt);
    // Language rides an in-memory override, NEVER localStorage: a full
    // navigation out of a fr scene (shot sweep's page.goto, hard refresh)
    // skips this cleanup, and a persisted 'fr' left the whole app French.
    if (current?.lang !== undefined) overrideLang(current.lang);
    // Some scenes force a painted-card cosmetic so the personalised avatar +
    // own 0-cards render. It lives in the same 'jaffre-profile' localStorage
    // key net/auth.ts reads; save the raw value and restore it on exit so a
    // scene never leaks its demo paint onto the real player.
    const prevProfile = localStorage.getItem(PROFILE_KEY);
    if (current?.paint !== undefined) {
      let profile: Record<string, unknown> = {};
      try {
        profile = prevProfile !== null ? (JSON.parse(prevProfile) as Record<string, unknown>) : {};
      } catch {
        profile = {};
      }
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, paint: current.paint }));
    }
    return () => {
      if (prevTheme === undefined) delete root.dataset['theme'];
      else root.dataset['theme'] = prevTheme;
      if (current?.cardSkin !== undefined) applyCardSkin(prevSkin);
      if (current?.felt !== undefined) applyFelt(prevFelt);
      if (current?.lang !== undefined) overrideLang(null);
      if (current?.paint !== undefined) {
        if (prevProfile === null) localStorage.removeItem(PROFILE_KEY);
        else localStorage.setItem(PROFILE_KEY, prevProfile);
      }
    };
  }, [current]);

  if (current === undefined) return null;

  const step = (delta: number) => {
    const next = SCENES[(((index + delta) % SCENES.length) + SCENES.length) % SCENES.length];
    if (next !== undefined) goTo(next.id);
  };

  return (
    <>
      {/* key remounts per scene so initial-state props (open panels) re-apply. */}
      {current.screen === 'home' && (
        <Home
          key={current.id}
          onPractice={noop}
          onJoinRoom={noop}
          helpOpen={current.ui?.helpOpen ?? false}
          playOpen={current.ui?.playOpen ?? false}
          customizeOpen={current.ui?.customizeOpen ?? false}
          loginOpen={current.ui?.loginOpen ?? false}
          {...(current.id === 'your-tables' ? { demoTables: DEMO_TABLES } : {})}
          {...(IDENTITY_STAGES[current.id] !== undefined
            ? { identityStage: IDENTITY_STAGES[current.id] }
            : {})}
        />
      )}
      {current.screen === 'corner' &&
        (current.id === 'corner-empty' ? (
          <Corner
            key={current.id}
            demoStats={{
              ...DEMO_STATS_NEW,
              games: 0,
              wins: 0,
              winRate: 0,
              netPoints: 0,
              streak: { current: 0, best: 0 },
            }}
            demoAwards={[]}
            onLeave={onLeave}
          />
        ) : (
          <Corner
            key={current.id}
            demoStats={DEMO_STATS}
            demoAwards={[
              { id: 'first-win', grantedAt: 1_752_000_000_000 },
              { id: 'first-game', grantedAt: 1_751_000_000_000 },
            ]}
            demoStanding={{
              id: 'demo',
              name: 'Marcel',
              color: null,
              rating: 1084,
              ratingGames: 24,
              rank: 7,
            }}
            onLeave={onLeave}
          />
        ))}
      {current.screen === 'awards' && (
        <Awards
          key={current.id}
          // Fresh = a TRUE zero record: with DEMO_STATS_NEW (2 games, 1 win)
          // the "0/9 earned" header sat above full 1/1 progress bars — the
          // server would have granted those, so the state was contradictory.
          demoStats={
            current.id === 'awards-fresh'
              ? {
                  ...DEMO_STATS_NEW,
                  games: 0,
                  wins: 0,
                  winRate: 0,
                  netPoints: 0,
                  streak: { current: 0, best: 0 },
                }
              : DEMO_STATS
          }
          demoEarned={current.id === 'awards-fresh' ? [] : DEMO_EARNED_AWARDS}
          demoArranging={current.id === 'awards-arranging'}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'leaderboard' && (
        <Leaderboard
          key={current.id}
          demo={current.id === 'leaderboard-empty' ? { top: [], you: null } : DEMO_LEADERBOARD}
          // Mounts straight onto the monthly tab — the toggle is a new violet
          // surface and the wins/net row shape is its own layout.
          {...(current.id === 'leaderboard-month' ? { demoMonth: DEMO_MONTHLY } : {})}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'lobby' && <Lobby key={current.id} code="scene" onLeave={onLeave} />}
      {current.screen === 'stats' &&
        (current.id === 'stats-loading' ? (
          <Stats key={current.id} demoLoading onLeave={onLeave} />
        ) : (
          <Stats
            key={current.id}
            demoStats={
              current.id === 'stats-empty'
                ? {
                    ...DEMO_STATS,
                    games: 0,
                    wins: 0,
                    winRate: 0,
                    netPoints: 0,
                    bestPartner: null,
                    nemesis: null,
                  }
                : current.id === 'stats-new'
                  ? DEMO_STATS_NEW
                  : current.id === 'stats-veteran'
                    ? DEMO_STATS_VETERAN
                    : DEMO_STATS
            }
            demoGames={
              current.id === 'stats-empty'
                ? []
                : current.id === 'stats-new'
                  ? DEMO_HISTORY_NEW
                  : current.id === 'stats-veteran'
                    ? DEMO_HISTORY_VETERAN
                    : current.id === 'stats-all-games'
                      ? // Long list so the "all games" view actually differs
                        // from the default recent slice (kept demo-1 first —
                        // the scene's probe links to its replay).
                        [...DEMO_HISTORY, ...DEMO_HISTORY_VETERAN]
                      : DEMO_HISTORY
            }
            {...(current.id === 'stats-all-games' ? { initialGamesView: 'all' as const } : {})}
            onLeave={onLeave}
          />
        ))}
      {current.screen === 'replay' && (
        <Replay key={current.id} gameId={null} demo={DEMO_REPLAY} onLeave={onLeave} />
      )}
      {/* The same staged game the replay scene uses, entered as a shared
          position: mid-round (the screen rewinds to the top of that trick on
          its own) and seated where the sharer was. */}
      {current.screen === 'hand' && (
        <Hand
          key={current.id}
          position={{ gameId: 'demo-1', actionIndex: 24, seat: 0 }}
          demo={DEMO_REPLAY}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'dealboard' && (
        <DealBoard
          key={current.id}
          demoBoard={DEMO_CHALLENGE_BOARD}
          demoNow={DEMO_NOW}
          // The name card can't be reached by clicking here: namePromptDue()
          // is false under navigator.webdriver unless ?nameprompt=1 rides
          // along, and a scene id can't carry a query string.
          demoNameGate={current.id.startsWith('dealboard-name-gate')}
          demoResult={current.id.startsWith('dealboard-result')}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'visitor' && (
        <Visitor key={current.id} code="scene" onSit={noop} onWatch={noop} onLeave={onLeave} />
      )}
      {current.screen === 'collection' && (
        <Collection key={current.id} demoStats={DEMO_STATS} onLeave={onLeave} />
      )}
      {current.screen === 'journey' && (
        <Journey
          key={current.id}
          demoStats={current.id === 'journey-new' ? DEMO_STATS_NEW : DEMO_STATS}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'paint' && <PaintStudio key={current.id} onLeave={onLeave} />}
      {current.screen === 'public-lobby' && (
        <PublicLobby
          key={current.id}
          onLeave={onLeave}
          onJoin={noop}
          demoRooms={current.id === 'public-lobby-empty' ? [] : DEMO_PUBLIC_ROOMS}
        />
      )}
      {current.screen === 'share' && (
        <>
          <main className="min-h-full bg-(--color-ap-ground)" />
          <ShareSheet key={current.id} code="scene" onCopy={noop} onClose={onLeave} />
        </>
      )}
      {current.screen === 'table' && (
        <Table
          key={current.id}
          onAction={noop}
          onLeave={onLeave}
          onRematch={noop}
          onSwapSeats={noop}
          online={current.online ?? false}
          frozenHold={current.frozenHold ?? false}
          initialUi={current.ui}
        />
      )}
      <div
        data-testid="scene-picker"
        // The replay screen owns its own bottom-centred transport bar, in the
        // same spot — and the picker's z-[100] wins, so it swallowed the clicks
        // meant for Next/Previous frame. Step aside for that one screen instead
        // of covering the very UI the scene exists to show.
        className={`fixed left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-(--radius-ap-panel) border-2 border-(--color-ap-violet)/50 bg-(--color-ap-ink) px-3 py-2 font-arcade-ui shadow-(--shadow-ap) ${
          current.screen === 'replay' ? 'bottom-20' : 'bottom-2'
        }`}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          className={GHOST_BTN_SM_DARK}
          aria-label="Previous scene"
        >
          ←
        </button>
        <select
          aria-label="Scene"
          value={current.id}
          onChange={(e) => goTo(e.target.value)}
          className="cursor-pointer rounded-(--radius-ap-control) border-2 border-white/20 bg-black/40 px-2 py-1.5 text-(length:--text-fluid-xs) text-white"
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => step(1)}
          className={GHOST_BTN_SM_DARK}
          aria-label="Next scene"
        >
          →
        </button>
      </div>
    </>
  );
}
