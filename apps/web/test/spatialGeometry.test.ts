import { describe, expect, it } from 'vitest';
import { bestCandidate, type NavRect } from '../src/keys/geometry.js';

/**
 * The d-pad's judgement, as pure arithmetic. What matters here is which of two
 * plausible neighbours wins: keyboard navigation feels wrong the moment a
 * press lands somewhere the eye didn't expect.
 */

const rect = (x: number, y: number, w = 100, h = 40): NavRect => ({
  left: x,
  top: y,
  right: x + w,
  bottom: y + h,
});

/** A button at the origin — every case navigates away from this one. */
const FROM = rect(0, 0);

describe('direction', () => {
  it('takes the nearest neighbour on the same row or column', () => {
    const right = [rect(400, 0), rect(120, 0)];
    expect(bestCandidate(FROM, right, 'right')).toBe(1);

    const down = [rect(0, 400), rect(0, 120)];
    expect(bestCandidate(FROM, down, 'down')).toBe(1);
  });

  it('reads left and up as the mirror of right and down', () => {
    const from = rect(400, 400);
    expect(bestCandidate(from, [rect(0, 400), rect(250, 400)], 'left')).toBe(1);
    expect(bestCandidate(from, [rect(400, 0), rect(400, 250)], 'up')).toBe(1);
  });

  it('ignores everything behind it', () => {
    expect(bestCandidate(FROM, [rect(-200, 0), rect(-400, 0)], 'right')).toBeNull();
  });

  it('ignores an element sitting on top of it', () => {
    // Same centre = no direction at all; without this an element could be its
    // own neighbour and focus would never move.
    expect(bestCandidate(FROM, [rect(0, 0)], 'right')).toBeNull();
  });

  it('has nowhere to go from an empty screen', () => {
    expect(bestCandidate(FROM, [], 'down')).toBeNull();
  });
});

describe('staying in line', () => {
  it('prefers a far neighbour in line over a near one off-axis', () => {
    const inLine = rect(300, 0);
    const offAxis = rect(60, 200);
    expect(bestCandidate(FROM, [inLine, offAxis], 'right')).toBe(0);
  });

  it('treats an overlapping row as perfectly in line', () => {
    // Both are the same distance right; the one whose vertical span still
    // touches the source's is the one the eye follows.
    const overlapping = rect(120, 30);
    const clearOfIt = rect(120, 50);
    expect(bestCandidate(FROM, [clearOfIt, overlapping], 'right')).toBe(1);
  });

  it('breaks an exact tie in the order it was given', () => {
    // Callers collect in DOM order, so ties resolve down the document.
    expect(bestCandidate(FROM, [rect(120, 0), rect(120, 0)], 'right')).toBe(0);
  });
});

describe('a grid', () => {
  // Three columns, two rows — the shape of the cosmetics gallery and the
  // meta-nav strip.
  const grid = [
    rect(0, 0),
    rect(120, 0),
    rect(240, 0),
    rect(0, 60),
    rect(120, 60),
    rect(240, 60),
  ] as const;
  const at = (i: number): NavRect => grid[i] as NavRect;

  it('walks a row without falling into the next one', () => {
    expect(bestCandidate(at(0), [...grid], 'right')).toBe(1);
    expect(bestCandidate(at(1), [...grid], 'right')).toBe(2);
  });

  it('drops straight down a column', () => {
    expect(bestCandidate(at(1), [...grid], 'down')).toBe(4);
  });

  it('stops at the far edge instead of wrapping', () => {
    // No wrap: the caller leaves the key to the browser, so the page scrolls
    // to whatever sits past the last button.
    expect(bestCandidate(at(2), [...grid], 'right')).toBeNull();
    expect(bestCandidate(at(0), [...grid], 'up')).toBeNull();
  });
});
