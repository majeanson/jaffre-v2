/**
 * The shared room "listen together" music queue: YouTube URL parsing, oEmbed
 * metadata lookup, add/remove/skip-vote/ended/error handling, the
 * per-recipient wire view (strips userIds, marks mine/youVotedSkip), and the
 * connected-seated-humans skip-majority threshold (falling back to a
 * connected-spectator majority when no seat is human-occupied, so an empty
 * table's watchers can still unstick a track). Owns MUSIC_QUEUE_CAP /
 * MUSIC_USER_PENDING_CAP / the add rate limit / MUSIC_STALE_MS.
 */
import type { MusicState, MusicTrack } from '@jaffre/protocol';
import type { GameRoom } from '../GameRoom.js';
import type { Attachment } from './types.js';

/** A queued/playing track as persisted. `addedById` is a userId kept for
 * ownership checks only — it is NEVER sent on the wire (musicFor strips it). */
export interface StoredTrack {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumb: string;
  addedById: string;
  addedByName: string;
  addedBySeat?: number;
}

export interface StoredMusic {
  queue: StoredTrack[];
  current: (StoredTrack & { startedAt: number }) | null;
  /** Monotonic entry-id counter — persisted so ids never collide across wakes. */
  nextId: number;
}

export function emptyMusic(): StoredMusic {
  return { queue: [], current: null, nextId: 1 };
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Pull the 11-char video id out of a pasted YouTube URL. Accepts
 * youtu.be/<id>, (www.|m.|music.)youtube.com/watch?v=, /shorts/<id>,
 * /embed/<id>, /live/<id>. Exported for tests. */
export function extractVideoId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = u.pathname.split('/')[1] ?? '';
    return YT_ID.test(id) ? id : null;
  }
  if (!/^(www\.|m\.|music\.)?youtube\.com$/.test(host)) return null;
  const v = u.searchParams.get('v');
  if (v !== null && YT_ID.test(v)) return v;
  const m = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/.exec(u.pathname);
  return m?.[1] ?? null;
}

const OEMBED_TIMEOUT_MS = 5_000;

/** oEmbed lookup — no API key needed. Null means the video is private,
 * removed, embed-blocked, or YouTube didn't answer in time; callers treat all
 * of those as "unavailable". Always queries the canonical watch URL so
 * music.youtube/shorts links normalize. */
async function fetchOEmbed(
  videoId: string,
): Promise<{ title: string; author: string; thumb: string } | null> {
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (typeof j.title !== 'string') return null;
    return {
      title: j.title.slice(0, 120),
      author: (j.author_name ?? '').slice(0, 80),
      thumb: typeof j.thumbnail_url === 'string' ? j.thumbnail_url : '',
    };
  } catch {
    return null;
  }
}

/** Shared music queue: whole-room cap and one user's not-yet-played cap. */
const MUSIC_QUEUE_CAP = 50;
const MUSIC_USER_PENDING_CAP = 10;
/** Sliding-window add rate limit, same shape as chat's. */
const MUSIC_RATE_LIMIT = 5;
const MUSIC_RATE_WINDOW_MS = 30_000;
/** No sane track outlasts this — a `current` older than 4h is a room that
 * slept mid-track; advance past it before welcoming a joiner so their player
 * doesn't chew through a wall of instant ENDED reports. */
export const MUSIC_STALE_MS = 4 * 3600_000;

export async function onMusicAdd(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  url: string,
): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  // Spectators may add — they listen too. Sliding-window rate limit, same
  // in-memory tradeoff as chatTimestamps.
  const now = Date.now();
  const recent = (room.musicAddTimestamps.get(att.userId) ?? []).filter(
    (t) => now - t < MUSIC_RATE_WINDOW_MS,
  );
  if (recent.length >= MUSIC_RATE_LIMIT) {
    room.musicAddTimestamps.set(att.userId, recent);
    room.send(ws, {
      t: 'error',
      code: 'MUSIC_RATE',
      message: 'Easy — a few songs per moment.',
    });
    return;
  }
  // Count the ATTEMPT, not the success — a burst of bad or unavailable
  // links must not get unlimited oEmbed fetches out of us.
  recent.push(now);
  room.musicAddTimestamps.set(att.userId, recent);
  // Caps before the oEmbed fetch — no point burning a request on a full queue.
  const pending = room.music.queue.filter((q) => q.addedById === att.userId).length;
  if (room.music.queue.length >= MUSIC_QUEUE_CAP || pending >= MUSIC_USER_PENDING_CAP) {
    room.send(ws, {
      t: 'error',
      code: 'MUSIC_QUEUE_FULL',
      message: 'The queue is full — let it play down a bit.',
    });
    return;
  }
  const videoId = extractVideoId(url);
  if (videoId === null) {
    room.send(ws, {
      t: 'error',
      code: 'MUSIC_BAD_URL',
      message: "That doesn't look like a YouTube link.",
    });
    return;
  }
  const meta = await fetchOEmbed(videoId);
  if (meta === null) {
    room.send(ws, {
      t: 'error',
      code: 'MUSIC_UNAVAILABLE',
      message: 'That video is private or unavailable.',
    });
    return;
  }
  const seat = room.seatOf(att.userId);
  const track: StoredTrack = {
    id: `m${String(room.music.nextId++)}`,
    videoId,
    title: meta.title,
    author: meta.author,
    thumb: meta.thumb,
    addedById: att.userId,
    addedByName: att.name,
    ...(seat !== null ? { addedBySeat: seat } : {}),
  };
  if (room.music.current === null) {
    room.music.current = { ...track, startedAt: Date.now() };
  } else {
    room.music.queue.push(track);
  }
  await room.ctx.storage.put('music', room.music);
  broadcastMusic(room);
}

/** Remove one of your own queued entries. Misses (already playing, already
 * removed, someone else's) are silent no-ops — the remove button races the
 * queue advancing, and an error toast for a double-click helps nobody. */
export async function onMusicRemove(room: GameRoom, att: Attachment, id: string): Promise<void> {
  const idx = room.music.queue.findIndex((q) => q.id === id && q.addedById === att.userId);
  if (!att.joined || idx === -1) return;
  room.music.queue.splice(idx, 1);
  await room.ctx.storage.put('music', room.music);
  broadcastMusic(room);
}

export async function onMusicSkipVote(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
): Promise<void> {
  if (!att.joined) {
    room.send(ws, {
      t: 'error',
      code: 'NOT_SEATED',
      message: 'Only seated players can vote to skip',
    });
    return;
  }
  // Normally a spectator can't end the track for the people actually playing
  // it. But an empty-seats table — every human stepped away, or the room is
  // all bots — has nobody seated left to ever cast that vote; the connected
  // spectators are the only humans left who CAN unstick it, so they're let
  // through exactly when no seated human is around to outrank them.
  if (typeof att.viewer !== 'number' && connectedSeatedUids(room).size > 0) {
    room.send(ws, {
      t: 'error',
      code: 'NOT_SEATED',
      message: 'Only seated players can vote to skip',
    });
    return;
  }
  if (room.music.current === null) return;
  room.skipVoters.add(att.userId);
  if (room.skipVoters.size >= skipThreshold(room)) {
    await advanceTrack(room);
  } else {
    broadcastMusic(room); // the vote count changed even without an advance
  }
}

/** A client's player reached ENDED. First report matching the current entry
 * advances; later ones no longer match and fall through — idempotent. Any
 * joined client could fake this, but that's the same trust level as chat at
 * a friendly table; the skip VOTE exists for human disagreement, not
 * adversarial clients. */
export async function onMusicEnded(room: GameRoom, att: Attachment, id: string): Promise<void> {
  if (!att.joined || room.music.current?.id !== id) return;
  await advanceTrack(room);
}

/** A client's player errored on the current track (private/removed/embed-
 * disabled). Advance when a majority agrees — or immediately when the
 * reporter is the track's own adder: whoever pasted a broken link shouldn't
 * need a majority to unstick the room. */
export async function onMusicError(room: GameRoom, att: Attachment, id: string): Promise<void> {
  const current = room.music.current;
  if (!att.joined || current?.id !== id) return;
  room.errorReporters.add(att.userId);
  if (att.userId === current.addedById || room.errorReporters.size >= skipThreshold(room)) {
    await advanceTrack(room);
  }
}

/** Connected seated-human userIds right now (excludes bots — bots have no
 * socket — and spectators). Shared by skipThreshold and the skip-vote gate,
 * both of which need to know whether anyone seated is even around. */
function connectedSeatedUids(room: GameRoom, exclude?: WebSocket): Set<string> {
  const uids = new Set<string>();
  for (const s of room.ctx.getWebSockets()) {
    if (s === exclude) continue;
    const a = room.attachment(s);
    if (a.joined && typeof a.viewer === 'number') uids.add(a.userId);
  }
  return uids;
}

/** Connected spectator userIds right now (joined, not seated). */
function connectedSpectatorUids(room: GameRoom, exclude?: WebSocket): Set<string> {
  const uids = new Set<string>();
  for (const s of room.ctx.getWebSockets()) {
    if (s === exclude) continue;
    const a = room.attachment(s);
    if (a.joined && typeof a.viewer !== 'number') uids.add(a.userId);
  }
  return uids;
}

/** Majority of CONNECTED seated humans (floor(n/2)+1, min 1). Connected —
 * a player who closed their tab must not raise the bar for those present.
 * `exclude` skips a socket that is closing right now.
 *
 * When NOBODY seated is connected (every human stepped away, or the table is
 * all bots) there is no seated majority to ever reach — the track would be
 * stuck forever for anyone still watching. Fall back to a majority of
 * connected SPECTATORS in that case; onMusicSkipVote only lets spectator
 * votes through under the same condition, so the two stay in lockstep. */
export function skipThreshold(room: GameRoom, exclude?: WebSocket): number {
  const seated = connectedSeatedUids(room, exclude);
  const pool = seated.size > 0 ? seated.size : connectedSpectatorUids(room, exclude).size;
  return Math.floor(pool / 2) + 1;
}

export async function maybeAdvanceBySkip(room: GameRoom, exclude?: WebSocket): Promise<void> {
  if (room.music.current !== null && room.skipVoters.size >= skipThreshold(room, exclude)) {
    await advanceTrack(room, exclude);
  }
}

/** Shift the queue into `current`, stamp a fresh startedAt, reset the vote
 * sets, persist, broadcast. */
export async function advanceTrack(room: GameRoom, exclude?: WebSocket): Promise<void> {
  const next = room.music.queue.shift() ?? null;
  room.music.current = next === null ? null : { ...next, startedAt: Date.now() };
  room.skipVoters.clear();
  room.errorReporters.clear();
  await room.ctx.storage.put('music', room.music);
  broadcastMusic(room, exclude);
}

/** Per-recipient music view: strips userIds, marks `mine`/`youVotedSkip`. */
export function musicFor(room: GameRoom, att: Attachment, exclude?: WebSocket): MusicState {
  const toWire = (t: StoredTrack): MusicTrack => ({
    id: t.id,
    videoId: t.videoId,
    title: t.title,
    author: t.author,
    thumb: t.thumb,
    addedBy: t.addedByName,
    ...(t.addedBySeat !== undefined ? { addedBySeat: t.addedBySeat } : {}),
    ...(t.addedById === att.userId ? { mine: true } : {}),
  });
  const current = room.music.current;
  return {
    current: current === null ? null : { ...toWire(current), startedAt: current.startedAt },
    queue: room.music.queue.map(toWire),
    skipVotes: room.skipVoters.size,
    skipNeeded: skipThreshold(room, exclude),
    ...(room.skipVoters.has(att.userId) ? { youVotedSkip: true } : {}),
  };
}

export function broadcastMusic(room: GameRoom, exclude?: WebSocket): void {
  for (const socket of room.ctx.getWebSockets()) {
    if (socket === exclude) continue;
    const a = room.attachment(socket);
    if (a.joined) room.send(socket, { t: 'music', state: musicFor(room, a, exclude) });
  }
}
