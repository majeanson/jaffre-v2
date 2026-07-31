import { describe, expect, it } from 'vitest';
import { joinPathToHash } from '../src/joinPath.js';

describe('joinPathToHash', () => {
  it('turns a valid /join path into the room hash, lowercased', () => {
    expect(joinPathToHash('/join/early-newt-os')).toBe('#room/early-newt-os');
    expect(joinPathToHash('/join/Early-Newt-OS')).toBe('#room/early-newt-os');
    expect(joinPathToHash('/join/a')).toBe('#room/a');
    expect(joinPathToHash(`/join/${'b'.repeat(32)}`)).toBe(`#room/${'b'.repeat(32)}`);
  });

  it('turns any other /join path into a hash the router cannot route', () => {
    // parseHash has no #join route, so these land on the BadLinkNotice
    // instead of silently pretending the link worked.
    expect(joinPathToHash('/join')).toBe('#join/');
    expect(joinPathToHash('/join/')).toBe('#join/');
    expect(joinPathToHash('/join/a/b')).toBe('#join/a/b');
    expect(joinPathToHash('/join/bad_code!')).toBe('#join/bad_code!');
    const long = 'c'.repeat(33);
    expect(joinPathToHash(`/join/${long}`)).toBe(`#join/${long}`);
    // Length-capped: a hostile 10 kB path can't ride into the hash.
    expect(joinPathToHash(`/join/${'d'.repeat(400)}`)).toBe(`#join/${'d'.repeat(40)}`);
  });

  it('ignores every path that is not /join', () => {
    expect(joinPathToHash('/')).toBeNull();
    expect(joinPathToHash('/api/health')).toBeNull();
    expect(joinPathToHash('/joinery')).toBeNull();
  });
});
