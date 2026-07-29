/**
 * ICE servers for the voice mesh.
 *
 * Degradation policy: STUN is unconditional, TURN is a bonus. Any failure
 * reaching Cloudflare Realtime falls back to STUN-only — this endpoint never
 * errors, because a voice feature that can't reach TURN should still connect
 * for the players who don't need it.
 */
import type { Env } from '../env.js';

/**
 * GET /api/ice → { iceServers } for the voice mesh. STUN always; when a
 * Cloudflare Realtime TURN key is configured, adds short-lived TURN
 * credentials so voice connects even across strict NATs. TURN failures
 * degrade to STUN-only — this endpoint never errors.
 */
export async function handleIce(env: Env): Promise<Response> {
  const iceServers: unknown[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  if (env.TURN_KEY_ID !== undefined && env.TURN_KEY_API_TOKEN !== undefined) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 6 * 3600 }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: unknown };
        if (Array.isArray(data.iceServers)) iceServers.push(...(data.iceServers as unknown[]));
        else if (data.iceServers !== undefined) iceServers.push(data.iceServers);
      }
    } catch {
      // STUN-only fallback.
    }
  }
  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
