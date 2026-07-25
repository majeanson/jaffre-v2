import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/index.js';

describe('add_bot difficulty', () => {
  it('accepts an explicit difficulty', () => {
    const msg = parseClientMessage(JSON.stringify({ t: 'add_bot', seat: 1, difficulty: 'hard' }));
    expect(msg).toEqual({ t: 'add_bot', seat: 1, difficulty: 'hard' });
  });

  it('accepts add_bot without a difficulty (old clients)', () => {
    const msg = parseClientMessage(JSON.stringify({ t: 'add_bot', seat: 2 }));
    expect(msg).toEqual({ t: 'add_bot', seat: 2 });
  });

  it('rejects an unknown difficulty', () => {
    expect(
      parseClientMessage(JSON.stringify({ t: 'add_bot', seat: 0, difficulty: 'nightmare' })),
    ).toBeNull();
  });

  it('strips unknown keys from add_bot (new client → old-shaped payloads)', () => {
    const msg = parseClientMessage(
      JSON.stringify({ t: 'add_bot', seat: 3, difficulty: 'normal', extra: true }),
    );
    expect(msg).toEqual({ t: 'add_bot', seat: 3, difficulty: 'normal' });
  });
});

describe('remove_bot', () => {
  it('accepts a seat', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'remove_bot', seat: 2 }))).toEqual({
      t: 'remove_bot',
      seat: 2,
    });
  });

  it('rejects a missing or out-of-range seat', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'remove_bot' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'remove_bot', seat: 4 }))).toBeNull();
  });
});

describe('kick', () => {
  it('accepts a seat', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'kick', seat: 2 }))).toEqual({
      t: 'kick',
      seat: 2,
    });
  });

  it('rejects a missing or out-of-range seat', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'kick' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'kick', seat: 4 }))).toBeNull();
  });
});

describe('set_rules', () => {
  it('accepts hailMary12 alone (turnTimer omitted for old clients)', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'set_rules', hailMary12: true }))).toEqual({
      t: 'set_rules',
      hailMary12: true,
    });
  });

  it('accepts hailMary12 with turnTimer', () => {
    expect(
      parseClientMessage(JSON.stringify({ t: 'set_rules', hailMary12: false, turnTimer: true })),
    ).toEqual({ t: 'set_rules', hailMary12: false, turnTimer: true });
  });

  it('rejects a missing or non-boolean hailMary12', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'set_rules' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'set_rules', hailMary12: 'yes' }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'set_rules', hailMary12: true, turnTimer: 'yes' })),
    ).toBeNull();
  });
});

describe('set_autoplay', () => {
  it('accepts on and off', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'set_autoplay', on: true }))).toEqual({
      t: 'set_autoplay',
      on: true,
    });
    expect(parseClientMessage(JSON.stringify({ t: 'set_autoplay', on: false }))).toEqual({
      t: 'set_autoplay',
      on: false,
    });
  });

  it('rejects a missing or non-boolean flag', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'set_autoplay' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'set_autoplay', on: 'yes' }))).toBeNull();
  });
});

describe('im_here', () => {
  it('parses the bare tap (seat comes from the sender, never the wire)', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'im_here' }))).toEqual({ t: 'im_here' });
  });
});
