/**
 * The worker entry: the Durable Object exports, and the router.
 *
 * Nothing here does work. Every handler lives in `src/routes/`, one module per
 * invariant it owns — the same carve `src/room/` gives GameRoom:
 *
 *   http        the shared plumbing (bearer, 503s, whose uid may be read)
 *   auth        identity: mint, recover, link (guest · email · Google)
 *   profile     the player's cosmetics on the users row
 *   games       the archive: finished-game history and replay logs
 *   stats       the aggregate record, and the awards derived from it
 *   head2head   your record with and against ONE other player, by public id
 *   dealBoard   daily/weekly challenge submit + standings
 *   leaderboard the global Elo ladder
 *   tables      the Lobby DO: quickplay, open tables, the live feed
 *   socket      the GameRoom DO: play socket, status peek, seat surrender
 *   join        the share link: SPA shell with live per-room OG tags
 *   telemetry · ice · push   client-capability endpoints, each with its own
 *                            documented degradation policy
 *
 * Route order matters only where an exact path could also match a pattern
 * below it; the patterns are anchored, so it doesn't today.
 */
import { GameRoom } from './GameRoom.js';
import { Lobby } from './Lobby.js';
import type { Env } from './env.js';
import {
  handleAuthMe,
  handleAuthMethods,
  handleEmailStart,
  handleEmailVerify,
  handleGoogleCallback,
  handleGoogleStart,
  handleGuestAuth,
  handleRecover,
} from './routes/auth.js';
import { handleChallengeBoard, handleChallengeSubmit } from './routes/dealBoard.js';
import { handleHistory, handleReplay } from './routes/games.js';
import { handleHeadToHead } from './routes/head2head.js';
import { handleIce } from './routes/ice.js';
import { handleJoin } from './routes/join.js';
import { handleLeaderboard } from './routes/leaderboard.js';
import { handleProfile } from './routes/profile.js';
import { handlePushSubscribe, handlePushUnsubscribe, handleVapidKey } from './routes/push.js';
import { handleRoomLeave, handleRoomSocket, handleRoomStatus } from './routes/socket.js';
import { handleAwardGrant, handleAwards, handleStats } from './routes/stats.js';
import { handleQuickplay, handleRooms, handleRoomsSocket } from './routes/tables.js';
import { handleTelemetry, handleTelemetrySummary } from './routes/telemetry.js';

export { GameRoom, Lobby };
export type { Env };

const REPLAY_RE = /^\/api\/replay\/([A-Za-z0-9-]{1,64})$/;
/** Mixed case accepted then lowercased: a hand-retyped share link must not
 * fall through to the SPA shell with generic tags (codes are minted
 * lowercase). Anything NOT matching this shape falls through to assets —
 * the SPA fallback plus the client-side net in apps/web/src/joinPath.ts
 * turn it into the in-app bad-link notice. */
const JOIN_RE = /^\/join\/([a-zA-Z0-9-]{1,32})$/;
const ROOM_STATUS_RE = /^\/api\/room\/([A-Za-z0-9-]{1,32})\/status$/;
const ROOM_LEAVE_RE = /^\/api\/room\/([A-Za-z0-9-]{1,32})\/leave$/;
const ROOM_WS_RE = /^\/ws\/([A-Za-z0-9-]{1,32})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/api/health') {
      return Response.json({ ok: true, service: 'jaffre' });
    }

    if (pathname === '/api/ice') return handleIce(env);

    if (pathname === '/api/auth/guest' && method === 'POST') return handleGuestAuth(request, env);
    if (pathname === '/api/auth/methods' && method === 'GET') return handleAuthMethods(env);
    if (pathname === '/api/auth/email/start' && method === 'POST') {
      return handleEmailStart(request, env);
    }
    if (pathname === '/api/auth/email/verify' && method === 'POST') {
      return handleEmailVerify(request, env);
    }
    if (pathname === '/api/auth/google' && method === 'GET') return handleGoogleStart(request, env);
    if (pathname === '/api/auth/google/callback' && method === 'GET') {
      return handleGoogleCallback(request, env);
    }
    if (pathname === '/api/auth/recover' && method === 'POST') return handleRecover(request, env);
    if (pathname === '/api/auth/me' && method === 'GET') return handleAuthMe(request, env);

    if (pathname === '/api/profile' && method === 'POST') return handleProfile(request, env);
    if (pathname === '/api/history' && method === 'GET') return handleHistory(request, env, url);
    if (pathname === '/api/stats' && method === 'GET') return handleStats(request, env, url);
    if (pathname === '/api/head2head' && method === 'GET') {
      return handleHeadToHead(request, env, url);
    }
    if (pathname === '/api/awards' && method === 'GET') return handleAwards(request, env, url);
    if (pathname === '/api/awards/grant' && method === 'POST') {
      return handleAwardGrant(request, env, url);
    }
    if (pathname === '/api/challenge' && method === 'GET') {
      return handleChallengeBoard(request, env, url);
    }
    if (pathname === '/api/challenge/submit' && method === 'POST') {
      return handleChallengeSubmit(request, env, url);
    }
    if (pathname === '/api/leaderboard' && method === 'GET') {
      return handleLeaderboard(request, env, url);
    }

    if (pathname === '/api/quickplay' && method === 'POST') return handleQuickplay(env);
    if (pathname === '/api/rooms' && method === 'GET') return handleRooms(env);
    if (pathname === '/api/rooms/ws') return handleRoomsSocket(request, env);

    const replayMatch = REPLAY_RE.exec(pathname);
    if (replayMatch !== null && method === 'GET') {
      return handleReplay(env, replayMatch[1] as string);
    }

    if (pathname === '/api/telemetry' && method === 'POST') return handleTelemetry(request, env);
    if (pathname === '/api/telemetry/summary' && method === 'GET') {
      return handleTelemetrySummary(env);
    }

    if (pathname === '/api/push/vapid' && method === 'GET') return handleVapidKey(env);
    if (pathname === '/api/push/subscribe' && method === 'POST') {
      return handlePushSubscribe(request, env);
    }
    if (pathname === '/api/push/unsubscribe' && method === 'POST') {
      return handlePushUnsubscribe(request, env);
    }

    const statusMatch = ROOM_STATUS_RE.exec(pathname);
    if (statusMatch !== null && method === 'GET') {
      return handleRoomStatus(env, statusMatch[1] as string);
    }
    const leaveMatch = ROOM_LEAVE_RE.exec(pathname);
    if (leaveMatch !== null && method === 'POST') {
      return handleRoomLeave(request, env, url, leaveMatch[1] as string);
    }
    const wsMatch = ROOM_WS_RE.exec(pathname);
    if (wsMatch !== null) {
      return handleRoomSocket(request, env, url, wsMatch[1] as string);
    }

    // The share link (wrangler.toml routes /join/* worker-first for this).
    const joinMatch = JOIN_RE.exec(pathname);
    if (joinMatch !== null && (method === 'GET' || method === 'HEAD')) {
      return handleJoin(request, env, (joinMatch[1] as string).toLowerCase());
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
