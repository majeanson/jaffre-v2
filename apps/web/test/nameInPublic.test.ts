import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The law: a name that leaves the SERVER for other people's eyes goes through
 * `displayName`. A bare `?? 'Player'` at a read site is the bug it exists to
 * prevent — every unnamed guest rendering identically, so nobody can tell who
 * beat whom.
 *
 * Why a source scan, and why here:
 *
 * This is the shape the failure actually took. `lobbyEntry()` emits the same
 * host field from two branches ('waiting' and 'playing') at DIFFERENT
 * indentation; a replace-all matched only one of them and reported success,
 * and the leak showed up solely on the public watch list of a game already in
 * progress — a payload no unit test was reading. A grep-level rule catches the
 * whole class, including the next emission point somebody adds.
 *
 * It lives in the web workspace, like violetInk.test.ts (which likewise scans
 * outside its own tree, into packages/ui), because apps/server's suite runs in
 * the Workers pool — no node:fs there, so it cannot read its own source.
 */

const SERVER_SRC = fileURLToPath(new URL('../../../apps/server/src', import.meta.url));

/**
 * WRITE paths, where a bare default is correct: these snapshot a name at the
 * moment a game ends or an account is minted, and rewriting history is not
 * their job. Their matching READ sites (routes/games.ts) disambiguate instead.
 */
const WRITE_PATHS = new Set(['history.ts', 'persistence.ts', 'auth.ts']);

/** Where DEFAULT_NAME itself is defined, alongside displayName. */
const DEFINITION = 'publicId.ts';

function* tsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* tsFiles(full);
    else if (entry.name.endsWith('.ts')) yield full;
  }
}

describe('names in public', () => {
  it("no server read site emits a bare 'Player' — it goes through displayName", () => {
    const offences: string[] = [];
    for (const file of tsFiles(SERVER_SRC)) {
      const base = file.split(/[\\/]/).pop() as string;
      if (base === DEFINITION || WRITE_PATHS.has(base)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes("'Player'")) return;
          // Fine when this very line hands it to the helper (e.g. a bot-name
          // fallback sitting beside a displayName call in one expression).
          if (line.includes('displayName(')) return;
          offences.push(`${base}:${String(i + 1)}: ${line.trim()}`);
        });
    }
    expect(offences).toEqual([]);
  });

  it('covers BOTH lobby-entry branches — the one that regressed', () => {
    // lobbyEntry() answers twice: for a waiting room and for a live one. The
    // live branch was the one missed, and it is the more public of the two —
    // it feeds the browsable "watch this game" list.
    const src = readFileSync(join(SERVER_SRC, 'GameRoom.ts'), 'utf8');
    // Object-literal entries (trailing comma), not the `host: string;` field
    // in the return type above them.
    const hosts = src.split('\n').filter((l) => /^\s*host:\s.*,$/.test(l));
    expect(hosts).toHaveLength(2);
    for (const line of hosts) expect(line).toContain('displayName(');
  });
});
