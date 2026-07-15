/**
 * Client-side room codes: friendly two-word handles plus a short random tail
 * so parallel tables never collide. Always matches the route's [a-z0-9-]+.
 */

const ADJECTIVES = [
  'amber',
  'brave',
  'clever',
  'dusty',
  'early',
  'fancy',
  'giddy',
  'honest',
  'ivory',
  'jolly',
  'lucky',
  'merry',
  'noble',
  'plucky',
  'quick',
  'royal',
  'sunny',
  'tidy',
  'vivid',
  'witty',
] as const;

const ANIMALS = [
  'bison',
  'crane',
  'crow',
  'fox',
  'gecko',
  'hare',
  'heron',
  'ibis',
  'koala',
  'lemur',
  'lynx',
  'moose',
  'newt',
  'otter',
  'owl',
  'panda',
  'quail',
  'raven',
  'tiger',
  'wren',
] as const;

function pick<T>(list: readonly T[]): T {
  const item = list[Math.floor(Math.random() * list.length)];
  if (item === undefined) throw new Error('empty list');
  return item;
}

export function generateRoomCode(): string {
  const tail = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .padStart(2, '0');
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${tail}`;
}
