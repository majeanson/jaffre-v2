/**
 * Opaque PUBLIC id for a user: a one-way 64-bit FNV-1a hash of the private
 * uid, hex-encoded. The uid itself is credential-shaped (the `?u=` and
 * X-User-Id fallbacks trust it), so it must never appear in a public payload
 * — but the leaderboard and the room roster still need a STABLE shared key so
 * the client can match "this seat" to "that ladder row" without guessing by
 * display name (duplicate names showed the wrong Elo).
 *
 * FNV, not SHA: roster() is synchronous inside the Durable Object and the id
 * only needs to be un-invertible (deriving a ~128-bit random uid from 64 bits
 * is information-theoretically hopeless) and collision-sparse at this game's
 * scale — not cryptographically strong.
 */
export function publicId(uid: string): string {
  // FNV-1a 64-bit over UTF-16 code units, in BigInt.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < uid.length; i++) {
    hash ^= BigInt(uid.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * The placeholder name every guest starts with. Lives here, beside the public
 * id, because both answer the same question: what do OTHER people see when
 * nobody has said who they are?
 */
export const DEFAULT_NAME = 'Player';

/**
 * The name to show other people.
 *
 * A guest is minted as "Player" the moment the home screen mounts, and only a
 * real login (adoptLoginName) or a deliberate rename ever changes it — so a
 * public surface full of guests was a wall of identical "Player" rows, with no
 * way to tell who beat whom. The same failure already bit this codebase once
 * from the other direction: duplicate display names showed the wrong Elo, which
 * is why `publicId` exists at all.
 *
 * So an untouched default gets 4 hex of its public id appended — still
 * anonymous, never ambiguous, and stable across every surface because it is
 * derived from the uid rather than stored. The instant someone picks a real
 * name it wins outright, including retroactively on the boards, which read
 * `users.name` live rather than snapshotting it.
 *
 * The LAST 4 hex, not the first: FNV-1a's final step is `(hash ^ byte) * prime`,
 * so a one-character difference at the end of a uid moves the result by only
 * ~prime (~2^40) and leaves the top 24 bits identical. Two ids differing in
 * their last character therefore SHARE their leading hex — the low end is the
 * mixed end. A test pinning two uids to distinct labels caught this.
 *
 * Idempotent: "Player 3f9a" is not the default, so re-running this is a no-op.
 */
export function displayName(name: string | null | undefined, uid: string | null): string {
  if (typeof name === 'string' && name !== '' && name !== DEFAULT_NAME) return name;
  // No account behind this seat (an abandoned or bot-filled row): there is
  // nothing to disambiguate against, so the bare default is the honest answer.
  if (uid === null) return DEFAULT_NAME;
  return `${DEFAULT_NAME} ${publicId(uid).slice(-4)}`;
}
