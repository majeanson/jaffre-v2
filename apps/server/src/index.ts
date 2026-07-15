import { GameRoom } from './GameRoom.js';

export { GameRoom };

export interface Env {
  ASSETS: Fetcher;
  GAME_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'jaffre' });
    }

    // /ws/:roomCode — WebSocket upgrade routed to the room's Durable Object.
    const wsMatch = /^\/ws\/([A-Za-z0-9-]{1,32})$/.exec(url.pathname);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const u = url.searchParams.get('u');
      const n = url.searchParams.get('n');
      if (u === null || u === '' || n === null || n === '') {
        return new Response('Missing u/n query params', { status: 400 });
      }
      const roomCode = wsMatch[1] as string;
      const id = env.GAME_ROOM.idFromName(roomCode);
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
