import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backLink,
  cameFrom,
  consumeEmbedParams,
  embedderOrigin,
  emitTableEvent,
  isEmbedded,
  scoreSummary,
} from '../src/embed.js';
import { playerName } from '../src/net/playerName.js';

/**
 * The embed contract with dads, tested where it lives: a set of pure decisions
 * over the URL, the referrer and whether we are framed. Node environment and
 * stubbed globals, matching helpLevel.test.ts — none of this needs a DOM, and
 * the interesting cases (a stranger framing us, a missing referrer) are ones a
 * component test could not reach.
 */

const DADS = 'https://dads.marcportal.com';
const JAFFRE = 'https://jaffre.marcportal.com';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

/** States the world a test wants, and hands back the parent it can spy on. */
function world({
  search = '',
  origin = JAFFRE,
  referrer = '',
  framed = false,
}: { search?: string; origin?: string; referrer?: string; framed?: boolean } = {}) {
  const parent = { postMessage: vi.fn() };
  const self = {};
  vi.stubGlobal('location', { search, origin });
  vi.stubGlobal('document', { referrer });
  vi.stubGlobal('window', { self, top: framed ? parent : self, parent });
  return parent;
}

beforeEach(() => store.clear());
afterEach(() => store.clear());

describe('consumeEmbedParams', () => {
  it('adopts a name the embedder passed', () => {
    world({ search: '?name=Marc&from=dads' });
    consumeEmbedParams();
    expect(playerName()).toBe('Marc');
  });

  it('leaves an existing name alone when none was passed', () => {
    store.set('jaffre-name', 'Existing');
    world({ search: '?from=dads' });
    consumeEmbedParams();
    expect(playerName()).toBe('Existing');
  });

  it('ignores an empty or whitespace name', () => {
    store.set('jaffre-name', 'Existing');
    world({ search: '?name=%20%20' });
    consumeEmbedParams();
    expect(playerName()).toBe('Existing');
  });

  it('will not let an embedder set a longer name than the app itself allows', () => {
    world({ search: `?name=${'x'.repeat(60)}` });
    consumeEmbedParams();
    expect(playerName()).toHaveLength(20);
  });

  it('handles a name that needed escaping', () => {
    world({ search: '?name=Marc%20%26%20Sam' });
    consumeEmbedParams();
    expect(playerName()).toBe('Marc & Sam');
  });
});

describe('cameFrom and backLink', () => {
  it('knows where the player came from', () => {
    world({ search: '?from=dads' });
    expect(cameFrom()).toBe('dads');
    expect(backLink()).toBe(DADS);
  });

  it('says nothing for an ordinary visit or an unknown source', () => {
    world({ search: '' });
    expect(cameFrom()).toBeNull();
    expect(backLink()).toBeNull();
    world({ search: '?from=somewhere-else' });
    expect(cameFrom()).toBeNull();
  });
});

describe('embedderOrigin', () => {
  it('is null when nobody is framing us', () => {
    world({ referrer: `${DADS}/`, framed: false });
    expect(isEmbedded()).toBe(false);
    expect(embedderOrigin()).toBeNull();
  });

  it('trusts dads', () => {
    world({ referrer: `${DADS}/room`, framed: true });
    expect(isEmbedded()).toBe(true);
    expect(embedderOrigin()).toBe(DADS);
  });

  it('refuses a stranger, even one claiming to be dads in the query', () => {
    world({ search: '?from=dads', referrer: 'https://evil.example/', framed: true });
    expect(embedderOrigin()).toBeNull();
  });

  it('refuses a missing referrer', () => {
    world({ referrer: '', framed: true });
    expect(embedderOrigin()).toBeNull();
  });

  it('lets a local jaffre talk to a local embedder, but never the deployed one', () => {
    world({ origin: 'http://localhost:5173', referrer: 'http://127.0.0.1:8788/', framed: true });
    expect(embedderOrigin()).toBe('http://127.0.0.1:8788');

    world({ origin: JAFFRE, referrer: 'http://127.0.0.1:8788/', framed: true });
    expect(embedderOrigin()).toBeNull();
  });
});

describe('emitTableEvent', () => {
  it('posts to the embedder, addressed to it rather than to everyone', () => {
    const parent = world({ referrer: `${DADS}/`, framed: true });
    emitTableEvent({ v: 1, t: 'seated', name: 'Marc' });
    expect(parent.postMessage).toHaveBeenCalledWith({ v: 1, t: 'seated', name: 'Marc' }, DADS);
  });

  it('stays quiet when unframed, or framed by a stranger', () => {
    const alone = world({ referrer: `${DADS}/`, framed: false });
    emitTableEvent({ v: 1, t: 'game-started' });
    expect(alone.postMessage).not.toHaveBeenCalled();

    const stranger = world({ referrer: 'https://evil.example/', framed: true });
    emitTableEvent({ v: 1, t: 'game-started' });
    expect(stranger.postMessage).not.toHaveBeenCalled();
  });

  it('carries the quiet-seat vocabulary, still as version 1', () => {
    const parent = world({ referrer: `${DADS}/`, framed: true });
    emitTableEvent({ v: 1, t: 'turn', name: 'Marc', seconds: 20 });
    emitTableEvent({ v: 1, t: 'away', name: 'Sam', seconds: 45 });
    emitTableEvent({ v: 1, t: 'back', name: 'Sam' });
    emitTableEvent({ v: 1, t: 'connection', state: 'reconnecting' });
    expect(parent.postMessage).toHaveBeenCalledTimes(4);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { v: 1, t: 'connection', state: 'reconnecting' },
      DADS,
    );
  });
});

describe('scoreSummary', () => {
  it('reads as a line somebody who does not play the game could print', () => {
    expect(scoreSummary([41, 37], 0)).toBe('41–37, Sun win');
    expect(scoreSummary([12, 41], 1)).toBe('12–41, Moon win');
  });

  it('treats team 0 winning as a winner, not as no winner', () => {
    expect(scoreSummary([41, 37], 0)).toContain('Sun');
    expect(scoreSummary([41, 37], null)).toBe('41–37');
  });
});
