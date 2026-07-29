/**
 * The alarm loop: the sole driver of bot turns, round_over auto-continue,
 * and disconnected/AFK-human bot-swaps. Bots (and round_over auto-continue)
 * only ever advance the game from here — never inline in a message handler —
 * so presence.ts's scheduleNextWake() is the single source of truth for when
 * this next runs. GameRoom.alarm() just re-hydrates and delegates to
 * runAlarm(); this file is where the actual policy lives.
 */
import { mulberry32, viewFor } from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import type { GameRoom } from '../GameRoom.js';
import { botDifficulty, isBotOwner, SEATS } from './types.js';
import {
  autoPlayOn,
  broadcastRoster,
  continueIfAllReady,
  disconnectDeadline,
  hasConnectedHuman,
  readyState,
  recapReadyDeadline,
  scheduleNextWake,
  turnTimerDeadline,
  vacateAbsentPreGame,
} from './presence.js';

/** Bot turns, round_over auto-continue, and disconnected-human bot-swaps
 * all run here, never inline. */
export async function runAlarm(room: GameRoom): Promise<void> {
  // Pre-game the alarm has exactly one job: free the seats of humans whose
  // disconnect grace ran out, so the table never carries ghosts.
  if (!room.meta.started) {
    await vacateAbsentPreGame(room);
    return;
  }
  const game = room.game;
  if (game === null || game.phase === 'game_over') return;
  // Freeze the table while no human is present: bots don't play into an empty
  // room, no disconnected human is auto-swapped or auto-readied, and no alarm
  // is re-armed. The game resumes when someone reconnects (onJoin re-wakes it).
  if (!hasConnectedHuman(room)) return;
  if (game.phase === 'round_over') {
    // Rounds wait for readiness; the alarm auto-readies humans whose
    // disconnect deadline has passed (an absent player can't stall the
    // table forever), humans on voluntary auto-play (they asked the
    // server to keep the game moving — that includes the round recap),
    // and — with the turnTimer rule on — connected humans who idled the
    // whole recap out (recapReadyDeadline; same spirit as their per-turn
    // timer, but readying only, never flipping auto-play).
    const ready = readyState(room);
    const now = Date.now();
    let changed = false;
    for (const s of SEATS) {
      const owner = room.meta.seats[s];
      if (
        !ready[s] &&
        typeof owner === 'string' &&
        (autoPlayOn(room, owner) ||
          disconnectDeadline(room, owner) <= now ||
          recapReadyDeadline(room, owner) <= now)
      ) {
        ready[s] = true;
        changed = true;
      }
    }
    if (changed) {
      room.meta.readyNextRound = ready;
      await room.ctx.storage.put('meta', room.meta);
      broadcastRoster(room, {});
    }
    // Attempted even when nothing changed above: a table run entirely by
    // bots (every human left mid-game, spectators still watching) is
    // all-ready without any auto-ready — this call is what advances it
    // past the recap instead of freezing there forever.
    await continueIfAllReady(room);
    if (room.game?.phase === 'round_over') {
      await scheduleNextWake(room);
    } else {
      // continueIfAllReady dealt the next round — possibly the game's last
      // (game_over). Unlike the webSocketMessage path, alarm() has no
      // trailing syncLobby of its own, so a bots-driven game_over would
      // otherwise linger listed forever.
      await room.syncLobby();
    }
    return;
  }
  const turnSeat = game.turn;
  const owner = room.meta.seats[turnSeat];
  const now = Date.now();
  const botActs =
    isBotOwner(owner) ||
    (typeof owner === 'string' &&
      (autoPlayOn(room, owner) ||
        disconnectDeadline(room, owner) <= now ||
        turnTimerDeadline(room) <= now));
  if (!botActs) {
    // A connected human's turn (or their deadline has not passed yet):
    // re-arm the alarm for whatever the next wake actually is.
    await scheduleNextWake(room);
    return;
  }
  // A connected human idling past the turn timer flips their auto-play ON,
  // not just this one turn: without it every later turn costs the table the
  // full timer again. The flag shows as the gold badge / lit toggle on their
  // client, and clears the moment they act (onAction) or toggle it off —
  // same contract as flipping it themselves.
  if (typeof owner === 'string' && !autoPlayOn(room, owner) && turnTimerDeadline(room) <= now) {
    room.meta.autoPlay = { ...room.meta.autoPlay, [owner]: true };
    await room.ctx.storage.put('meta', room.meta);
    broadcastRoster(room, {});
  }
  const rng = mulberry32((game.seed ^ room.seq) >>> 0);
  // Bot seats play at their own level; a voluntary-AFK human is covered at
  // 'hard' (their choice); a disconnected human is covered at 'normal' — fair
  // to both teams.
  const difficulty = isBotOwner(owner)
    ? botDifficulty(owner)
    : typeof owner === 'string' && autoPlayOn(room, owner)
      ? 'hard'
      : 'normal';
  const action = chooseAction(viewFor(game, turnSeat), rng, difficulty);
  if (action === null) {
    // Should be unreachable in bidding/playing. chooseAction is
    // deterministic for a given (state, seq), so re-arming would only spin
    // the alarm on the same null — log loudly instead; the next
    // join/message re-kicks the table via scheduleNextWake.
    console.error('[alarm] bot policy returned no action', {
      seat: turnSeat,
      phase: game.phase,
      seq: room.seq,
      difficulty,
    });
    return;
  }
  await room.applyEngineAction(action);
  // A bot's move can be the one that ends the game (game_over) or starts one
  // being watched — alarm() isn't followed by webSocketMessage's syncLobby,
  // so without this a bot-finished public game would never deregister.
  await room.syncLobby();
}
