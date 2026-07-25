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
