/**
 * One Durable Object per game room. M0 stub: accepts WebSockets via the
 * hibernation API and echoes messages. Real protocol lands at M5.
 */
export class GameRoom implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    ws.send(JSON.stringify({ t: 'echo', data: typeof message === 'string' ? message : null }));
  }

  webSocketClose(ws: WebSocket): void {
    ws.close();
  }
}
