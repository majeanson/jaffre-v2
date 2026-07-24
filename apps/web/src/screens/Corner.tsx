import { useState } from 'react';
import { AvatarChip, Cta, useLang, type Lang } from '@jaffre/ui';
import { MetaNav } from '../components/MetaNav.js';
import { TableCard, useTableStatuses } from '../home/TableCards.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';
import { leaveTable, listTables, type TableEntry } from '../net/rooms.js';

export interface CornerProps {
  readonly onLeave: () => void;
  /** Scene viewer: stage the standing tables (else they come from localStorage). */
  readonly demoTables?: readonly TableEntry[];
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    yourTables: string;
    going: (n: number) => string;
    noTables: string;
    noTablesBody: string;
  }
> = {
  en: {
    title: 'Your corner',
    home: 'Home',
    yourTables: 'Your tables',
    going: (n) => `${String(n)} going`,
    noTables: 'No standing tables',
    noTablesBody: 'Create a room from Play and it keeps a seat for you here.',
  },
  fr: {
    title: 'Ton coin',
    home: 'Accueil',
    yourTables: 'Tes tables',
    going: (n) => `${String(n)} en route`,
    noTables: 'Pas de table en cours',
    noTablesBody: 'Crée un salon depuis Jouer et ta place t’attend ici.',
  },
};

/**
 * "Your corner": the one full-screen sheet for everything that's yours. The
 * MetaNav strip on top is the subtab row (tables, games, record, awards,
 * journey, collection, leaderboard — each its own hash route sharing this
 * same header shape), and this screen's own body is the standing tables.
 */
export function Corner({ onLeave, demoTables }: CornerProps) {
  const t = T[useLang()];
  // Stateful so quitting a table drops its card without a reload.
  const [storedTables, setStoredTables] = useState<readonly TableEntry[]>(listTables);
  const tables = demoTables ?? storedTables;
  const statuses = useTableStatuses(tables);
  const quitTable = (code: string) => {
    void leaveTable(code); // forgets locally right away, frees the seat async
    setStoredTables(listTables());
  };

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-[0.5em]">
            <AvatarChip name={playerName()} color={getProfile().color ?? undefined} size="sm" />
            <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
              {t.title}
            </h1>
          </div>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

        <MetaNav current="corner" />

        {tables.length === 0 ? (
          <div className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.4em] text-center font-arcade-ui shadow-(--shadow-ap)">
            <div className="font-arcade-display text-[1.3em] uppercase text-(--color-ap-gold)">
              {t.noTables}
            </div>
            <p className="mt-[0.5em] text-(--color-ap-muted)">{t.noTablesBody}</p>
          </div>
        ) : (
          <section className="flex flex-col gap-3 font-arcade-ui">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-arcade-display text-[1.2em] uppercase text-(--color-ap-text)">
                {t.yourTables}
              </h2>
              <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                {t.going(tables.length)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tables.slice(0, 8).map((tbl) => (
                <TableCard
                  key={tbl.code}
                  table={tbl}
                  status={statuses[tbl.code] ?? null}
                  onResume={() => (location.hash = `#room/${tbl.code}`)}
                  // Staged scenes keep the ✕ too — the e2e overflow probe
                  // checks it stays inside the card; quitting only mutates
                  // local state, so a demo "leave" is harmless.
                  onLeave={() => quitTable(tbl.code)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
