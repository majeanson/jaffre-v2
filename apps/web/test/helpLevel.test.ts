import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpLevel } from '../src/help/helpLevel.js';

/**
 * The help dial's placement rule, tested where it actually lives: a pure
 * decision over two stored keys. It runs ONCE per load and then writes itself
 * down, so the interesting cases are all first-load ones — which is exactly
 * what a component test could never reach.
 */

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

/** A fresh module per case: `resolveHelpLevel` caches, by design. */
async function bootWith(
  seed: Record<string, string>,
): Promise<typeof import('../src/help/helpLevel.js')> {
  store.clear();
  for (const [k, v] of Object.entries(seed)) store.set(k, v);
  vi.resetModules();
  const mod = await import('../src/help/helpLevel.js');
  mod.resolveHelpLevel();
  return mod;
}

/** What tutorialPref writes once the practice intro has been shown. */
const TUTORIAL_TAKEN = JSON.stringify({ steps: ['intro', 'bidding'] });

describe('resolveHelpLevel', () => {
  beforeEach(() => store.clear());

  it('teaches a player it has never met', async () => {
    const m = await bootWith({});
    expect(m.currentHelpLevel()).toBe('learning');
  });

  it('stops teaching someone who has already taken the tutorial', async () => {
    const m = await bootWith({ 'jaffre:practiceTutorial': TUTORIAL_TAKEN });
    expect(m.currentHelpLevel()).toBe('coach');
  });

  it('honours an explicit level over everything else', async () => {
    for (const level of ['learning', 'coach', 'off'] as const) {
      const m = await bootWith({
        'jaffre:help': level,
        'jaffre:coach': 'on',
        'jaffre:practiceTutorial': TUTORIAL_TAKEN,
      });
      expect(m.currentHelpLevel()).toBe(level);
    }
  });

  it('ignores a stored level it does not recognise', async () => {
    const m = await bootWith({ 'jaffre:help': 'verbose' });
    expect(m.currentHelpLevel()).toBe('learning');
  });

  // The one migration case that matters: "Coach off" was the only way anyone
  // could ever say "leave me alone", so it must not come back as a default.
  it('keeps a player who switched the old Coach off silent', async () => {
    const m = await bootWith({ 'jaffre:coach': 'off' });
    expect(m.currentHelpLevel()).toBe('off');
  });

  it('does not read "Coach off" as expertise for a mid-tutorial player', async () => {
    const m = await bootWith({ 'jaffre:coach': 'off', 'jaffre:practiceTutorial': TUTORIAL_TAKEN });
    expect(m.currentHelpLevel()).toBe('off');
  });

  it('places an old Coach-on player by whether they took the tutorial', async () => {
    expect((await bootWith({ 'jaffre:coach': 'on' })).currentHelpLevel()).toBe('learning');
    expect(
      (
        await bootWith({ 'jaffre:coach': 'on', 'jaffre:practiceTutorial': TUTORIAL_TAKEN })
      ).currentHelpLevel(),
    ).toBe('coach');
  });

  it('writes its answer down, so the derivation runs once and never again', async () => {
    await bootWith({ 'jaffre:coach': 'off' });
    expect(store.get('jaffre:help')).toBe('off');
    // Clearing the legacy key must not move anyone: the answer is stored now.
    store.delete('jaffre:coach');
    vi.resetModules();
    const again = await import('../src/help/helpLevel.js');
    expect(again.resolveHelpLevel()).toBe('off');
  });

  it('teaches, rather than silences, when storage throws', async () => {
    store.clear();
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
    });
    const m = await import('../src/help/helpLevel.js');
    expect(m.resolveHelpLevel()).toBe('learning');
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
});

describe('setHelpLevel', () => {
  it('persists and is read back by currentHelpLevel', async () => {
    const m = await bootWith({});
    m.setHelpLevel('off');
    expect(m.currentHelpLevel()).toBe('off');
    expect(store.get('jaffre:help')).toBe('off');
  });
});

describe('the two predicates', () => {
  const cases: readonly [HelpLevel, boolean, boolean][] = [
    ['learning', true, true],
    ['coach', true, false],
    ['off', false, false],
  ];

  it.each(cases)('%s → coach %s, teaching %s', async (level, coach, teaching) => {
    const m = await bootWith({});
    expect(m.showsCoach(level)).toBe(coach);
    expect(m.showsTeaching(level)).toBe(teaching);
  });

  it('is a ladder — teaching never outlives the Coach', async () => {
    const m = await bootWith({});
    for (const level of m.HELP_LEVELS) {
      if (m.showsTeaching(level)) expect(m.showsCoach(level)).toBe(true);
    }
  });
});
