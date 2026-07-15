import { send, setRtcHandler } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { useVoiceStore } from '../state/voiceStore.js';

/**
 * WebRTC voice mesh for seated humans. Signaling rides the game WebSocket
 * (`{t:'rtc', to, payload}`); the server relays only between seated players.
 *
 * Topology: full mesh, one RTCPeerConnection per other seated human. Glare is
 * avoided by a fixed initiator rule — the LOWER seat number creates the offer.
 * Discovery: `joinVoice()` broadcasts `{kind:'hello'}`; a live peer either
 * initiates (if lower) or replies hello so the lower side initiates.
 *
 * Voice is strictly optional: every failure path degrades to "no voice" and
 * never touches game state.
 */

type Signal =
  | { kind: 'hello' }
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit | null }
  | { kind: 'mute'; muted: boolean }
  | { kind: 'leave' };

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
};

const SPEAKING_POLL_MS = 100;
const SPEAKING_RMS = 0.02;

interface Peer {
  readonly pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  /** ICE candidates that arrived before the remote description was set. */
  pendingIce: RTCIceCandidateInit[];
  /** One reconnection attempt after an ICE failure — never a retry storm. */
  retried: boolean;
}

let localStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let localAnalyser: AnalyserNode | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let live = false;
const peers = new Map<number, Peer>();

setRtcHandler((from, payload) => {
  void handleSignal(from, payload);
});

function mySeat(): number | null {
  const viewer = useGameStore.getState().viewer;
  return typeof viewer === 'number' ? viewer : null;
}

/** Absolute seats of the OTHER seated humans (bots never get voice). */
function otherHumanSeats(): number[] {
  const roster = useGameStore.getState().roster;
  const me = mySeat();
  if (roster === null || me === null) return [];
  return roster.seats.flatMap((s, i) => (s !== null && !s.isBot && i !== me ? [i] : []));
}

function signal(to: number, payload: Signal): void {
  send({ t: 'rtc', to: to as 0 | 1 | 2 | 3, payload });
}

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

/** Start voice. MUST be called from a user gesture (mic prompt + autoplay). */
export async function joinVoice(): Promise<void> {
  const store = useVoiceStore.getState();
  if (store.status === 'live' || store.status === 'joining') return;
  if (mySeat() === null) return; // spectators never get voice
  store.setStatus('joining');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    useVoiceStore
      .getState()
      .setStatus('error', 'Mic unavailable — voice is off, the game continues.');
    return;
  }
  localStream = stream;
  live = true;
  try {
    audioCtx = new AudioContext();
    localAnalyser = makeAnalyser(stream);
  } catch {
    audioCtx = null; // no speaking indicators, voice still works
  }
  startSpeakingPoll();
  useVoiceStore.getState().setStatus('live');
  // Announce: live peers respond by initiating per the seat rule.
  for (const seat of otherHumanSeats()) signal(seat, { kind: 'hello' });
}

export function leaveVoice(): void {
  if (!live && localStream === null) {
    useVoiceStore.getState().reset();
    return;
  }
  live = false;
  for (const seat of [...peers.keys()]) {
    signal(seat, { kind: 'leave' });
    cleanupPeer(seat);
  }
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  localAnalyser = null;
  if (audioCtx !== null) {
    void audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }
  useVoiceStore.getState().reset();
}

export function toggleMute(): void {
  if (localStream === null) return;
  const muted = !useVoiceStore.getState().muted;
  for (const track of localStream.getAudioTracks()) track.enabled = !muted;
  useVoiceStore.getState().setSelf({ muted, speaking: false });
  for (const seat of peers.keys()) signal(seat, { kind: 'mute', muted });
}

/* ── Signaling ─────────────────────────────────────────────────────────── */

function isSignal(payload: unknown): payload is Signal {
  return typeof payload === 'object' && payload !== null && 'kind' in payload;
}

async function handleSignal(from: number, payload: unknown): Promise<void> {
  const me = mySeat();
  if (!live || me === null || from === me || !isSignal(payload)) return;
  try {
    switch (payload.kind) {
      case 'hello': {
        // A peer (re)joined voice. Renegotiate unless the link is already up.
        if (peers.get(from)?.pc.connectionState === 'connected') return;
        cleanupPeer(from);
        if (me < from) await sendOffer(from);
        else signal(from, { kind: 'hello' }); // the lower side initiates
        return;
      }
      case 'offer': {
        cleanupPeer(from);
        const peer = createPeer(from);
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        await flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        signal(from, { kind: 'answer', sdp: answer.sdp ?? '' });
        return;
      }
      case 'answer': {
        const peer = peers.get(from);
        if (peer === undefined || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        await flushIce(peer);
        return;
      }
      case 'ice': {
        const peer = peers.get(from);
        if (peer === undefined || payload.candidate === null) return;
        if (peer.pc.remoteDescription === null) peer.pendingIce.push(payload.candidate);
        else await peer.pc.addIceCandidate(payload.candidate);
        return;
      }
      case 'mute':
        useVoiceStore.getState().setPeer(from, { muted: payload.muted });
        return;
      case 'leave':
        cleanupPeer(from);
        useVoiceStore.getState().removePeer(from);
        return;
    }
  } catch {
    // A broken handshake only costs that one link — mark it and move on.
    useVoiceStore.getState().setPeer(from, { connected: false });
  }
}

async function sendOffer(seat: number, iceRestart = false): Promise<void> {
  const peer = peers.get(seat) ?? createPeer(seat);
  const offer = await peer.pc.createOffer(iceRestart ? { iceRestart: true } : {});
  await peer.pc.setLocalDescription(offer);
  signal(seat, { kind: 'offer', sdp: offer.sdp ?? '' });
}

async function flushIce(peer: Peer): Promise<void> {
  const pending = peer.pendingIce;
  peer.pendingIce = [];
  for (const candidate of pending) {
    await peer.pc.addIceCandidate(candidate).catch(() => undefined);
  }
}

/* ── Peer connections ──────────────────────────────────────────────────── */

function createPeer(seat: number): Peer {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const peer: Peer = { pc, audio: null, analyser: null, pendingIce: [], retried: false };
  peers.set(seat, peer);
  if (localStream !== null) {
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  }
  pc.onicecandidate = (e) => {
    signal(seat, { kind: 'ice', candidate: e.candidate === null ? null : e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    attachAudio(peer, stream);
  };
  pc.onconnectionstatechange = () => {
    if (!live) return;
    const state = pc.connectionState;
    if (state === 'connected') {
      useVoiceStore.getState().setPeer(seat, { connected: true });
    } else if (state === 'failed') {
      useVoiceStore.getState().setPeer(seat, { connected: false, speaking: false });
      const me = mySeat();
      // One ICE-restart retry, initiator side only. If it fails again the
      // peer just stays "no voice" — the game is unaffected.
      if (!peer.retried && me !== null && me < seat) {
        peer.retried = true;
        void sendOffer(seat, true).catch(() => undefined);
      }
    } else if (state === 'disconnected' || state === 'closed') {
      useVoiceStore.getState().setPeer(seat, { connected: false, speaking: false });
    }
  };
  useVoiceStore.getState().setPeer(seat, { connected: false, muted: false, speaking: false });
  return peer;
}

function cleanupPeer(seat: number): void {
  const peer = peers.get(seat);
  if (peer === undefined) return;
  peers.delete(seat);
  peer.pc.onicecandidate = null;
  peer.pc.ontrack = null;
  peer.pc.onconnectionstatechange = null;
  try {
    peer.pc.close();
  } catch {
    // Already closed.
  }
  if (peer.audio !== null) {
    peer.audio.srcObject = null;
    peer.audio.remove();
  }
  useVoiceStore.getState().setPeer(seat, { connected: false, speaking: false });
}

function attachAudio(peer: Peer, stream: MediaStream): void {
  if (peer.audio === null) {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    peer.audio = el;
  }
  peer.audio.srcObject = stream;
  void peer.audio.play().catch(() => undefined); // joinVoice ran in a gesture
  try {
    peer.analyser = makeAnalyser(stream);
  } catch {
    peer.analyser = null;
  }
}

/* ── Speaking detection ────────────────────────────────────────────────── */

function makeAnalyser(stream: MediaStream): AnalyserNode | null {
  if (audioCtx === null) return null;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  return analyser;
}

function rms(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

function startSpeakingPoll(): void {
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const store = useVoiceStore.getState();
    if (localAnalyser !== null) {
      const speaking = !store.muted && rms(localAnalyser) > SPEAKING_RMS;
      if (speaking !== store.speaking) store.setSelf({ speaking });
    }
    for (const [seat, peer] of peers) {
      if (peer.analyser === null) continue;
      const speaking = rms(peer.analyser) > SPEAKING_RMS;
      if (speaking !== (store.peers[seat]?.speaking ?? false)) {
        store.setPeer(seat, { speaking });
      }
    }
  }, SPEAKING_POLL_MS);
}
