/**
 * Pre-game and between-games seat/session lifecycle: the join handshake, sit
 * (including mid-game bot takeover and the between-games re-seat), add/
 * remove bot, host kick, seat-swap re-pairing, permanent leave, house
 * rules, table (public) visibility, and the `start`/rematch deal.
 */
import { createGame, serialize, viewFor } from '@jaffre/engine';
import type { Seat, Viewer } from '@jaffre/engine';
import type { BotDifficulty } from '@jaffre/bots';
import type { GameRoom } from '../GameRoom.js';
import { displayName } from '../publicId.js';
import { isBotOwner, SEATS, type Attachment, type SeatOwner } from './types.js';
import { advanceTrack, MUSIC_STALE_MS } from './music.js';
import {
  broadcastRoster,
  clearUserState,
  isConnected,
  markBack,
  notifyHostOfJoin,
  scheduleNextWake,
  unseatUser,
} from './presence.js';

export async function onJoin(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  paint?: string,
): Promise<void> {
  const seat = room.seatOf(att.userId);
  att.viewer = seat ?? 'spectator';
  att.joined = true;
  // Ride the socket, not the room: promoted into meta by onSit if this
  // viewer ever takes a seat, and gone with the socket if they don't.
  if (paint === undefined) delete att.paint;
  else att.paint = paint;
  ws.serializeAttachment(att);
  let metaDirty = false;
  // Only SEATED users are kept in meta. Every reader of names/paints — the
  // roster, the lobby's host field, history and persistence — asks about a
  // seat, and chat carries att.name directly, so a spectator's entries were
  // write-only bytes that nothing pruned (clearUserState runs on unseat, which
  // a spectator never does). onSit stamps both for anyone who does sit.
  if (seat !== null) {
    if (room.meta.names[att.userId] !== att.name) {
      room.meta.names[att.userId] = att.name;
      metaDirty = true;
    }
    // The join carries the player's current avatar painting (or nothing when
    // they have none / erased it) — keep the stored copy in sync either way.
    if ((room.meta.paints?.[att.userId] ?? undefined) !== paint) {
      const others = Object.fromEntries(
        Object.entries(room.meta.paints ?? {}).filter(([id]) => id !== att.userId),
      );
      room.meta.paints = paint === undefined ? others : { ...others, [att.userId]: paint };
      metaDirty = true;
    }
  }
  // Rejoining stops the disconnect clock — the human resumes control.
  if (room.meta.disconnectedSince?.[att.userId] !== undefined) {
    room.meta.disconnectedSince = Object.fromEntries(
      Object.entries(room.meta.disconnectedSince).filter(([id]) => id !== att.userId),
    );
    metaDirty = true;
    // Only drops a "back" chat line if a bot had actually taken this seat
    // over (botPlayingAnnounced) — a reconnect that beat the swap deadline
    // never announced a takeover in the first place.
    markBack(room, att.userId);
  }
  if (metaDirty) await room.ctx.storage.put('meta', room.meta);
  // A room that slept mid-track wakes with an ancient `current` — advance
  // past it before welcoming, so the joiner's player doesn't have to grind
  // through a backlog of instant ENDED reports.
  while (
    room.music.current !== null &&
    Date.now() - room.music.current.startedAt > MUSIC_STALE_MS
  ) {
    await advanceTrack(room);
  }
  room.sendWelcome(ws, att);
  broadcastRoster(room, { skip: ws });
  // A human is present again — resume a table that paused when the room
  // emptied (bot turns, disconnect deadlines, round_over auto-continue).
  await scheduleNextWake(room);
}

export async function onSit(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  seat: Seat,
): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  if (room.meta.kickedIds?.includes(att.userId) === true) {
    room.send(ws, {
      t: 'error',
      code: 'KICKED',
      message: 'The host removed you from this table.',
    });
    return;
  }
  const occupant = room.meta.seats[seat];
  if (occupant === att.userId) {
    // Already own this seat — idempotent.
    att.viewer = seat;
    ws.serializeAttachment(att);
    room.sendWelcome(ws, att);
    broadcastRoster(room, {});
    return;
  }
  // A spectator may take over a bot seat mid-game — the seat's hand/tricks/turn
  // carry over untouched, and the alarm's isBotOwner check means it will no
  // longer bot-play this (now human-owned) seat.
  const midGameTakeover =
    isBotOwner(occupant) &&
    room.meta.started &&
    room.game !== null &&
    room.game.phase !== 'game_over';
  // Between games (game_over, before a rematch) the table re-opens with
  // pre-game seating semantics: a leaver's empty seat or a bot seat may be
  // (re)claimed — this is what makes the lobby's between-games 'waiting'
  // listing (and Quick Play claiming it) actually joinable.
  const betweenGames = room.meta.started && room.game !== null && room.game.phase === 'game_over';
  // The sitter's current seat, if any — a seated player who moves onto an
  // occupied seat swaps with its owner; a spectator has none to swap back.
  const oldSeat = room.seatOf(att.userId);

  // While the game is LIVE, the ONLY allowed seat change is a mid-game bot
  // takeover. Everything else is fixed until game_over.
  if (room.meta.started && !midGameTakeover && !betweenGames) {
    room.send(
      ws,
      occupant !== null
        ? { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` }
        : {
            t: 'error',
            code: 'ALREADY_STARTED',
            message: 'Cannot change seats after the game has started',
          },
    );
    return;
  }

  // Decide what goes back into the sitter's old seat. Pre-game, moving onto an
  // occupied seat is a swap (bot ↔ you, or human ↔ you); a spectator taking a
  // bot seat just displaces the bot (nothing to swap back), but may never bump
  // a seated human.
  let displaced: SeatOwner = null;
  if (occupant !== null && !midGameTakeover) {
    if (typeof occupant === 'string') {
      if (oldSeat === null) {
        room.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
        return;
      }
      displaced = occupant; // the other human moves to the sitter's old seat
    } else {
      displaced = oldSeat !== null ? occupant : null; // swap the bot back, or drop it
    }
  }

  for (const s of SEATS) {
    if (room.meta.seats[s] === att.userId) room.meta.seats[s] = null;
  }
  room.meta.seats[seat] = att.userId;
  if (oldSeat !== null && displaced !== null) room.meta.seats[oldSeat] = displaced;
  // A between-games claim inherits a seat whose recap rating line belonged
  // to its previous owner — drop that line so the newcomer's chip doesn't
  // wear someone else's "+12".
  if (betweenGames && oldSeat === null && room.meta.lastRatings !== undefined) {
    room.meta.lastRatings = room.meta.lastRatings.filter((r) => r.seat !== seat);
  }
  room.meta.names[att.userId] = att.name;
  // Promote the painting the socket arrived with — onJoin deliberately left it
  // there rather than in meta, since until this moment they were a spectator.
  if ((room.meta.paints?.[att.userId] ?? undefined) !== att.paint) {
    const others = Object.fromEntries(
      Object.entries(room.meta.paints ?? {}).filter(([id]) => id !== att.userId),
    );
    room.meta.paints = att.paint === undefined ? others : { ...others, [att.userId]: att.paint };
  }
  if (room.meta.disconnectedSince?.[att.userId] !== undefined) {
    room.meta.disconnectedSince = Object.fromEntries(
      Object.entries(room.meta.disconnectedSince).filter(([id]) => id !== att.userId),
    );
  }
  // Claim the host role if nobody holds it, or the current host's seat has
  // opened up (left/kicked) — the role passes naturally to whoever sits next.
  if (room.meta.hostId === undefined || room.seatOf(room.meta.hostId) === null) {
    room.meta.hostId = att.userId;
  }
  att.viewer = seat;
  ws.serializeAttachment(att);
  await room.ctx.storage.put('meta', room.meta);
  // Fresh welcome so the sitter's client adopts its new viewer identity —
  // the store only learns `viewer` from welcome snapshots.
  room.sendWelcome(ws, att);
  // A swapped-out human moved seats too — refresh their clients' viewer.
  if (typeof displaced === 'string' && oldSeat !== null) {
    for (const socket of room.ctx.getWebSockets()) {
      const a = room.attachment(socket);
      if (a.userId !== displaced || typeof a.viewer !== 'number') continue;
      a.viewer = oldSeat;
      socket.serializeAttachment(a);
      if (a.joined) room.sendWelcome(socket, a);
    }
  }
  broadcastRoster(room, {});
  // A "sat down" chat line, but only for someone who WASN'T already seated —
  // the idempotent same-seat re-sit returns before here, and a seated
  // player's pre-game/between-games seat swap (oldSeat !== null) isn't a
  // "sitting down" moment for anyone at the table.
  if (oldSeat === null) {
    await room.pushSystemChat({
      code: 'sat',
      name: displayName(room.meta.names[att.userId], att.userId),
    });
  }
  // Table-filled push: bring an absent host back when a stranger joins their
  // not-yet-started table. Deliberately NOT gated on meta.public — the
  // private share-a-link host is the one who put the phone down, and needs
  // the nudge at least as much as a public-listing host does; notifyHostOfJoin's
  // own per-sitter throttle is what keeps this from spamming. Mid-game the
  // only seat change possible is a spectator taking over a bot seat
  // (midGameTakeover, above) — that path never reaches here with `started`
  // true and a real host mismatch, but the `!started` check is kept explicit
  // to match the spec this mirrors.
  if (
    !room.meta.started &&
    att.userId !== room.meta.hostId &&
    room.meta.hostId !== undefined &&
    !isConnected(room, room.meta.hostId)
  ) {
    notifyHostOfJoin(room, att.userId, att.name);
  }
}

/** Empty a bot seat back to vacant — pre-game, or between games (game_over,
 * before a rematch): same betweenGames window onSit/onStart already open, so
 * a standing table can shed a bot seat while re-forming. LIVE mid-game stays
 * closed — a bot mid-hand is holding cards for a team that needs them. */
export async function onRemoveBot(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  seat: Seat,
): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  const betweenGames = room.meta.started && room.game !== null && room.game.phase === 'game_over';
  if (room.meta.started && !betweenGames) {
    room.send(ws, {
      t: 'error',
      code: 'ALREADY_STARTED',
      message: 'Cannot remove bots after the game has started',
    });
    return;
  }
  if (!isBotOwner(room.meta.seats[seat])) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: `Seat ${seat} has no bot` });
    return;
  }
  room.meta.seats[seat] = null;
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
}

/**
 * Host-only, pre-game: vacate another human's seat and ban them from this
 * table for its life (kickedIds — checked in onSit). The freed seat and the
 * webSocketMessage-wrapping syncLobby() reopen matchmaking on that seat, same
 * as any other seat freeing up.
 */
export async function onKick(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  seat: Seat,
): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  if (room.meta.started) {
    room.send(ws, {
      t: 'error',
      code: 'ALREADY_STARTED',
      message: 'Cannot remove a player after the game has started',
    });
    return;
  }
  const senderSeat = room.seatOf(att.userId);
  if (senderSeat === null || att.userId !== room.meta.hostId) {
    room.send(ws, {
      t: 'error',
      code: 'NOT_HOST',
      message: 'Only the host can remove a player',
    });
    return;
  }
  const target = room.meta.seats[seat];
  if (typeof target !== 'string' || target === att.userId) {
    room.send(ws, {
      t: 'error',
      code: 'BAD_MESSAGE',
      message: `Seat ${seat} has no other player to remove`,
    });
    return;
  }
  room.meta.seats[seat] = null;
  room.meta.kickedIds = [...(room.meta.kickedIds ?? []), target];
  clearUserState(room, target);
  await room.ctx.storage.put('meta', room.meta);
  for (const socket of room.ctx.getWebSockets()) {
    const a = room.attachment(socket);
    if (a.userId !== target || typeof a.viewer !== 'number') continue;
    a.viewer = 'spectator';
    socket.serializeAttachment(a);
    if (a.joined) room.sendWelcome(socket, a);
  }
  broadcastRoster(room, {});
}

/**
 * Between games (game_over only): re-pair the table by swapping seats 1 and
 * 2, so both teams get new partners before the rematch. Seat ownership moves,
 * so every affected client gets a fresh welcome to adopt its new viewer seat;
 * the next `start` deals with the new seating.
 */
export async function onSwapSeats(room: GameRoom, ws: WebSocket, att: Attachment): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  if (typeof att.viewer !== 'number') {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Only a seated player can swap' });
    return;
  }
  if (room.game === null || room.game.phase !== 'game_over') {
    room.send(ws, {
      t: 'error',
      code: 'BAD_MESSAGE',
      message: 'Seats can only be swapped between games',
    });
    return;
  }
  // Swap seats 1 ↔ 2 — re-pairs both teams (0&2 vs 1&3 → everyone new partner).
  const tmp = room.meta.seats[1];
  room.meta.seats[1] = room.meta.seats[2];
  room.meta.seats[2] = tmp;
  await room.ctx.storage.put('meta', room.meta);
  // Seat ownership moved — refresh each connected client's viewer identity.
  for (const socket of room.ctx.getWebSockets()) {
    const a = room.attachment(socket);
    if (!a.joined) continue;
    const viewer: Viewer = room.seatOf(a.userId) ?? 'spectator';
    if (viewer !== a.viewer) {
      a.viewer = viewer;
      socket.serializeAttachment(a);
      room.sendWelcome(socket, a);
    }
  }
  broadcastRoster(room, {});
}

/** A seated player gives up their seat for good (recap "Leave" / home row). */
export async function onLeave(room: GameRoom, ws: WebSocket, att: Attachment): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  // Captured before unseatUser runs — it doesn't touch meta.names, but the
  // name a departing player is known by belongs in the chat line either way.
  const name = displayName(room.meta.names[att.userId], att.userId);
  const left = await unseatUser(room, att.userId);
  if (left) await room.pushSystemChat({ code: 'left', name });
}

/** Add a bot to a vacant (or bot-owned, to change difficulty) seat — pre-game,
 * or between games (game_over, before a rematch): same betweenGames window
 * onSit/onStart already open, so a standing table that lost a human to a
 * permanent leave can still fill back up to four and rematch, instead of
 * being stuck one seat short forever. LIVE mid-game stays closed (onSit's
 * midGameTakeover is the only seat change allowed then). */
export async function onAddBot(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  seat: Seat,
  difficulty: BotDifficulty = 'normal',
): Promise<void> {
  if (!att.joined) {
    room.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
    return;
  }
  const betweenGames = room.meta.started && room.game !== null && room.game.phase === 'game_over';
  if (room.meta.started && !betweenGames) {
    room.send(ws, {
      t: 'error',
      code: 'ALREADY_STARTED',
      message: 'Cannot add bots after the game has started',
    });
    return;
  }
  const occupant = room.meta.seats[seat];
  // A human occupies the seat — cannot be replaced by a bot.
  if (occupant !== null && !isBotOwner(occupant)) {
    room.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
    return;
  }
  // Empty seat → add a bot; existing bot seat → change its difficulty in place.
  room.meta.seats[seat] = { bot: true, difficulty };
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
}

export async function onSetRules(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  hailMary12: boolean,
  turnTimer?: boolean,
): Promise<void> {
  // Only seated players may set house rules, and only before a live game —
  // the rule is fixed for the game the moment it starts.
  const gameInProgress = room.meta.started && room.game?.phase !== 'game_over';
  if (gameInProgress) {
    room.send(ws, { t: 'error', code: 'ALREADY_STARTED', message: 'Game already started' });
    return;
  }
  if (!att.joined || typeof att.viewer !== 'number') {
    room.send(ws, {
      t: 'error',
      code: 'NOT_SEATED',
      message: 'Only seated players can set rules',
    });
    return;
  }
  room.meta.rules = { hailMary12, ...(turnTimer !== undefined ? { turnTimer } : {}) };
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
}

/** Host toggles whether this table is listed for matchmaking. Any seated
 * player may flip it (small, friendly tables); broadcastRoster then syncs the
 * lobby registry. */
export async function onSetPublic(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  on: boolean,
): Promise<void> {
  if (!att.joined || room.seatOf(att.userId) === null) {
    room.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
    return;
  }
  if ((room.meta.public ?? false) === on) return; // no-op
  room.meta.public = on;
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
}

export async function onStart(room: GameRoom, ws: WebSocket, att: Attachment): Promise<void> {
  // A finished game may be restarted in place (rematch, same table).
  const isRematch = room.meta.started && room.game?.phase === 'game_over';
  if (room.meta.started && !isRematch) {
    room.send(ws, { t: 'error', code: 'ALREADY_STARTED', message: 'Game already started' });
    return;
  }
  if (!att.joined || typeof att.viewer !== 'number') {
    room.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Only seated players can start' });
    return;
  }
  if (room.meta.seats.some((s) => s === null)) {
    room.send(ws, {
      t: 'error',
      code: 'BAD_MESSAGE',
      message: 'All four seats must be filled to start',
    });
    return;
  }
  if (isRematch) {
    // Clear the previous game's action log so the next history record and
    // any replay contain only the new game.
    const oldLog = await room.ctx.storage.list({ prefix: 'log:' });
    if (oldLog.size > 0) await room.ctx.storage.delete([...oldLog.keys()]);
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const seed = buf[0] ?? 0;
  const game = createGame(seed, room.meta.rules ?? { hailMary12: true });
  room.game = game;
  const startedAt = Date.now();
  room.meta.started = true;
  room.meta.startedAt = startedAt;
  // The freshly-dealt hand's bidding starts right now — the first turn's
  // turn-timer clock (if the rule is on) begins here too.
  room.meta.turnStartedAt = startedAt;
  // A seat can enter a game already wearing an OLD disconnect stamp (a
  // pre-game drop inside the vacate grace, or a player who went absent
  // during the previous game of a rematch). Left alone, a stamp older than
  // BOT_SWAP_MS would bot-cover them from the very first turn — restart
  // every absent player's clock so a new game always grants the full grace.
  if (room.meta.disconnectedSince !== undefined) {
    room.meta.disconnectedSince = Object.fromEntries(
      Object.keys(room.meta.disconnectedSince).map((uid) => [uid, startedAt]),
    );
  }
  // Rematch: the previous game's rating movement no longer applies to the
  // recap that hasn't happened yet.
  delete room.meta.lastRatings;
  room.seq = 0;
  await room.ctx.storage.put({ meta: room.meta, game: serialize(game), seq: room.seq });
  for (const socket of room.ctx.getWebSockets()) {
    const a = room.attachment(socket);
    if (!a.joined) continue;
    room.send(socket, { t: 'view', seq: room.seq, view: viewFor(game, a.viewer) });
  }
  broadcastRoster(room, {});
  await room.pushSystemChat({ code: 'started' });
  await scheduleNextWake(room);
}
