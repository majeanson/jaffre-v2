import { describe, expect, it } from 'vitest';
import { fmtPercent } from '../src/format.js';

// A no-break space, narrow (U+202F) or regular (U+00A0) depending on the
// runtime's bundled CLDR data — either is fine, a plain breaking space is not.
const NBSP = /[  ]/;

describe('fmtPercent', () => {
  it('formats en with a bare sign, no space', () => {
    expect(fmtPercent('en', 64)).toBe('64%');
    expect(fmtPercent('en', 0)).toBe('0%');
    expect(fmtPercent('en', 100)).toBe('100%');
  });

  it('formats fr-QC with a no-break space before the sign', () => {
    const s = fmtPercent('fr', 64);
    expect(s).not.toBe('64%');
    expect(s).not.toContain(' %'); // not a plain ASCII space
    expect(s).toMatch(NBSP);
    expect(s.replace(NBSP, ' ')).toBe('64 %');
  });

  it('rounds like the call sites that feed it Math.round already', () => {
    expect(fmtPercent('en', 67)).toBe('67%');
    expect(fmtPercent('fr', 67).replace(NBSP, ' ')).toBe('67 %');
  });
});
