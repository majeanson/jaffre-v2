/**
 * The player's cosmetics: the shape stored on the `users` row, the read that
 * every auth mint echoes back, and the partial-update endpoint behind it.
 *
 * Validation here is SHAPE only — eligibility to *use* a skin is derived from
 * `/api/stats` on the client, which keeps `/api/stats` the single unlock
 * source with zero new server state.
 */
import type { Env } from '../env.js';
import { isUsableSecret, verifyToken } from '../auth/session.js';
import { bearerToken, noDb, noSecret } from './http.js';

export interface Profile {
  readonly color: string | null;
  readonly paint: string | null;
  readonly cardSkin: string | null;
  readonly theme: string | null;
  readonly bonhommeSkin: string | null;
  readonly felt: string | null;
  readonly sweep: string | null;
  /** Trophy-shelf arrangement: a JSON array of award ids, or null for catalog
   * order. Display-only — never gates what is earned. */
  readonly awardOrder: string | null;
}

export const NO_PROFILE: Profile = {
  color: null,
  paint: null,
  cardSkin: null,
  theme: null,
  bonhommeSkin: null,
  felt: null,
  sweep: null,
  awardOrder: null,
};

/** The player's cosmetics (colour, painted card, card skin, theme, bonhomme
 * skin), or nulls when unset / no DB. Best-effort: a read failure degrades to
 * "no profile", never throws. */
export async function readProfile(env: Env, uid: string): Promise<Profile> {
  if (env.DB === undefined) return NO_PROFILE;
  try {
    const row = await env.DB.prepare(
      'SELECT color, paint, card_skin, theme, bonhomme_skin, felt, sweep, award_order FROM users WHERE id = ?1',
    )
      .bind(uid)
      .first<{
        color: string | null;
        paint: string | null;
        card_skin: string | null;
        theme: string | null;
        bonhomme_skin: string | null;
        felt: string | null;
        sweep: string | null;
        award_order: string | null;
      }>();
    return {
      color: row?.color ?? null,
      paint: row?.paint ?? null,
      cardSkin: row?.card_skin ?? null,
      theme: row?.theme ?? null,
      bonhommeSkin: row?.bonhomme_skin ?? null,
      felt: row?.felt ?? null,
      sweep: row?.sweep ?? null,
      awardOrder: row?.award_order ?? null,
    };
  } catch (err) {
    console.error('[users] profile read failed', err);
    return NO_PROFILE;
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** A cosmetic id (card skin / theme): lowercase slug, mirrors the client
 * catalogs. We validate SHAPE only — eligibility to *use* a skin is derived
 * from `/api/stats` on the client, keeping `/api/stats` the single unlock
 * source with zero new server state. */
const SKIN_ID_RE = /^[a-z0-9-]{1,24}$/;
/** Upper bound on a stored trophy-shelf arrangement. Comfortably above the
 * award catalog so it never rejects a real shelf, low enough that the column
 * can't be used as scratch storage. */
const AWARD_ORDER_MAX = 128;
/** Cap on the whole POST body — the painted-canvas data URL is the big field.
 * A 260×347 PNG of brush strokes compresses well under this. */
const PROFILE_MAX_BYTES = 512 * 1024;

/**
 * POST /api/profile {color?, paint?, cardSkin?, theme?, bonhommeSkin?, felt?,
 * sweep?} → {userId, ...profile}.
 * Authenticated by Bearer token; persists the player's cosmetics to `users`.
 * Each field is optional: absent leaves the column untouched, explicit `null`
 * clears it. No account vocabulary — this is just the look of your cards.
 */
export async function handleProfile(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  const token = bearerToken(request);
  if (token === null) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const identity = await verifyToken(token, env.SESSION_SECRET);
  if (identity === null) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader !== null && Number(lengthHeader) > PROFILE_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > PROFILE_MAX_BYTES) return new Response('Payload too large', { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  let color: string | null | undefined;
  if ('color' in b) {
    if (b.color === null) color = null;
    else if (typeof b.color === 'string' && HEX_RE.test(b.color)) color = b.color.toLowerCase();
    else return Response.json({ error: 'color must be a #rrggbb hex or null' }, { status: 400 });
  }
  let paint: string | null | undefined;
  if ('paint' in b) {
    if (b.paint === null) paint = null;
    else if (typeof b.paint === 'string' && b.paint.startsWith('data:image/')) paint = b.paint;
    else
      return Response.json({ error: 'paint must be a data:image/ URL or null' }, { status: 400 });
  }
  let cardSkin: string | null | undefined;
  if ('cardSkin' in b) {
    if (b.cardSkin === null) cardSkin = null;
    else if (typeof b.cardSkin === 'string' && SKIN_ID_RE.test(b.cardSkin)) cardSkin = b.cardSkin;
    else return Response.json({ error: 'cardSkin must be a skin id or null' }, { status: 400 });
  }
  let theme: string | null | undefined;
  if ('theme' in b) {
    if (b.theme === null) theme = null;
    else if (typeof b.theme === 'string' && SKIN_ID_RE.test(b.theme)) theme = b.theme;
    else return Response.json({ error: 'theme must be a theme id or null' }, { status: 400 });
  }
  let bonhommeSkin: string | null | undefined;
  if ('bonhommeSkin' in b) {
    if (b.bonhommeSkin === null) bonhommeSkin = null;
    else if (typeof b.bonhommeSkin === 'string' && SKIN_ID_RE.test(b.bonhommeSkin))
      bonhommeSkin = b.bonhommeSkin;
    else return Response.json({ error: 'bonhommeSkin must be a skin id or null' }, { status: 400 });
  }
  let felt: string | null | undefined;
  if ('felt' in b) {
    if (b.felt === null) felt = null;
    else if (typeof b.felt === 'string' && SKIN_ID_RE.test(b.felt)) felt = b.felt;
    else return Response.json({ error: 'felt must be a felt id or null' }, { status: 400 });
  }
  let sweep: string | null | undefined;
  if ('sweep' in b) {
    if (b.sweep === null) sweep = null;
    else if (typeof b.sweep === 'string' && SKIN_ID_RE.test(b.sweep)) sweep = b.sweep;
    else return Response.json({ error: 'sweep must be a sweep id or null' }, { status: 400 });
  }
  let awardOrder: string | null | undefined;
  if ('awardOrder' in b) {
    if (b.awardOrder === null) awardOrder = null;
    else if (
      Array.isArray(b.awardOrder) &&
      b.awardOrder.length <= AWARD_ORDER_MAX &&
      b.awardOrder.every((id) => typeof id === 'string' && SKIN_ID_RE.test(id))
    ) {
      // Stored as JSON so the column stays a plain TEXT like every other
      // profile field. Ids are NOT checked against the award catalog here —
      // the catalog is the client's (see apps/web/src/awards.ts), and the
      // reader ignores anything it doesn't recognise, so a stale or unknown id
      // is inert rather than an error that would block saving a valid shelf.
      awardOrder = JSON.stringify(b.awardOrder);
    } else {
      return Response.json(
        { error: 'awardOrder must be an array of award ids, or null' },
        { status: 400 },
      );
    }
  }
  if (
    color === undefined &&
    paint === undefined &&
    cardSkin === undefined &&
    theme === undefined &&
    bonhommeSkin === undefined &&
    felt === undefined &&
    sweep === undefined &&
    awardOrder === undefined
  ) {
    return Response.json(
      {
        error: 'Provide color, paint, cardSkin, theme, bonhommeSkin, felt, sweep and/or awardOrder',
      },
      { status: 400 },
    );
  }

  // Partial UPDATE touching only the provided columns; bind indices track the
  // running length so the provided values and uid line up regardless of which
  // are present.
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (color !== undefined) {
    binds.push(color);
    sets.push(`color = ?${String(binds.length)}`);
  }
  if (paint !== undefined) {
    binds.push(paint);
    sets.push(`paint = ?${String(binds.length)}`);
  }
  if (cardSkin !== undefined) {
    binds.push(cardSkin);
    sets.push(`card_skin = ?${String(binds.length)}`);
  }
  if (theme !== undefined) {
    binds.push(theme);
    sets.push(`theme = ?${String(binds.length)}`);
  }
  if (bonhommeSkin !== undefined) {
    binds.push(bonhommeSkin);
    sets.push(`bonhomme_skin = ?${String(binds.length)}`);
  }
  if (felt !== undefined) {
    binds.push(felt);
    sets.push(`felt = ?${String(binds.length)}`);
  }
  if (sweep !== undefined) {
    binds.push(sweep);
    sets.push(`sweep = ?${String(binds.length)}`);
  }
  if (awardOrder !== undefined) {
    binds.push(awardOrder);
    sets.push(`award_order = ?${String(binds.length)}`);
  }
  binds.push(identity.uid);
  try {
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${String(binds.length)}`)
      .bind(...binds)
      .run();
  } catch (err) {
    console.error('[users] profile update failed', err);
    return Response.json({ error: 'Could not save profile' }, { status: 500 });
  }
  const profile = await readProfile(env, identity.uid);
  return Response.json({ userId: identity.uid, ...profile });
}
