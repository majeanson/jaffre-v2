import { useEffect } from 'react';
import { DEMO_HISTORY, DEMO_REPLAY, DEMO_STATS, SCENES } from '../dev/scenes.js';
import { GHOST_BTN_SM_DARK } from '../components/buttonStyles.js';
import { History } from './History.js';
import { Home } from './Home.js';
import { Lobby } from './Lobby.js';
import { Replay } from './Replay.js';
import { Stats } from './Stats.js';
import { Table } from './Table.js';
import { Visitor } from './Visitor.js';

export interface ScenesProps {
  /** Scene id from '#scenes/<id>'; null or unknown falls back to the first. */
  readonly sceneId: string | null;
  readonly onLeave: () => void;
}

const noop = () => undefined;

const goTo = (id: string) => {
  location.hash = `#scenes/${id}`;
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
          demoResume={current.id === 'your-tables' ? { code: 'salon', series: [3, 2] } : undefined}
        />
      )}
      {current.screen === 'lobby' && <Lobby key={current.id} code="scene" onLeave={onLeave} />}
      {current.screen === 'history' && (
        <History
          key={current.id}
          demoGames={current.id === 'history-empty' ? [] : DEMO_HISTORY}
          onLeave={onLeave}
        />
      )}
      {current.screen === 'stats' && (
        <Stats
          key={current.id}
          demoStats={
            current.id === 'stats-empty'
              ? { ...DEMO_STATS, games: 0, wins: 0, winRate: 0, bestPartner: null }
              : DEMO_STATS
          }
          onLeave={onLeave}
        />
      )}
      {current.screen === 'replay' && (
        <Replay key={current.id} gameId={null} demo={DEMO_REPLAY} onLeave={onLeave} />
      )}
      {current.screen === 'visitor' && (
        <Visitor key={current.id} code="scene" onSit={noop} onWatch={noop} onLeave={onLeave} />
      )}
      {current.screen === 'table' && (
        <Table
          key={current.id}
          onAction={noop}
          onLeave={onLeave}
          onRematch={noop}
          online={current.online ?? false}
          frozenHold={current.frozenHold ?? false}
          initialUi={current.ui}
        />
      )}
      <div
        data-testid="scene-picker"
        className="fixed bottom-2 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-(--color-accent)/40 bg-black/80 px-3 py-2 shadow-(--shadow-panel)"
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
          className="cursor-pointer rounded-lg border border-white/15 bg-(--color-felt-800) px-2 py-1.5 text-(length:--text-fluid-xs) text-(--color-ivory)"
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
