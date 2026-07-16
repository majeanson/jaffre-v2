/**
 * Tiny Web Audio card-sound engine — short synthesized card noises (paper
 * flicks, snaps on felt, riffles) for a tactile, deck-like feel. Off by
 * default (opt-in via the sound toggle). The AudioContext is created lazily
 * and resumed on the first user gesture to satisfy the browser autoplay
 * policy. No asset files: every sound is filtered noise (the "paper" of a
 * card) plus, for plays, a soft low thump (the card landing on felt), with
 * a little jitter so a cascade sounds organic.
 */

const STORAGE_KEY = 'jaffre-sound';

export type ClickKind = 'deal' | 'play' | 'sort' | 'select' | 'illegal';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function soundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'on';
}

export function setSoundEnabled(on: boolean): void {
  localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  if (on) void ensureCtx()?.resume(); // warm up inside the toggle's gesture
}

function ensureCtx(): AudioContext | null {
  if (ctx !== null) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);
  return ctx;
}

// Create/resume the context ONLY inside real user gestures — doing either
// anywhere else (effects, timers) trips the browser autoplay policy and logs
// "An AudioContext was prevented from starting automatically".
if (typeof window !== 'undefined') {
  const unlock = (): void => {
    if (!soundEnabled()) return;
    const c = ensureCtx();
    if (c !== null && c.state === 'suspended') void c.resume();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

// One shared second of white noise — every card sound is a filtered slice.
let noiseBuffer: AudioBuffer | null = null;
function ensureNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer !== null) return noiseBuffer;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** A filtered noise burst — the papery texture of a card in motion. */
function paper(
  c: AudioContext,
  when: number,
  opts: { freq: number; q: number; peak: number; attack: number; tail: number },
): void {
  const src = c.createBufferSource();
  src.buffer = ensureNoise(c);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq * (0.88 + Math.random() * 0.24);
  filter.Q.value = opts.q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(opts.peak, when + opts.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.tail);
  src
    .connect(filter)
    .connect(gain)
    .connect(master as GainNode);
  src.start(when, Math.random() * 0.4, opts.tail + 0.05);
}

/** A soft low thump — the card (or your knuckle) landing on the felt. */
function thump(c: AudioContext, when: number, freq: number, peak: number, tail: number): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * (0.95 + Math.random() * 0.1), when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), when + tail);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + tail);
  osc.connect(gain).connect(master as GainNode);
  osc.start(when);
  osc.stop(when + tail + 0.02);
}

/**
 * Play one card sound. No-op unless sound is enabled AND the context is
 * already running (unlocked by a prior gesture) — never creates or resumes
 * here, since plays can fire from timers where that would be blocked.
 */
export function playClick(kind: ClickKind): void {
  if (!soundEnabled()) return;
  const c = ctx;
  if (c === null || master === null || c.state !== 'running') return;
  const now = c.currentTime;
  switch (kind) {
    case 'deal':
      // A card flicked off the deck: quick bright swish.
      paper(c, now, { freq: 3800, q: 0.9, peak: 0.5, attack: 0.006, tail: 0.07 });
      break;
    case 'play':
      // The card snapped down: papery crack plus a felt thump underneath.
      paper(c, now, { freq: 1800, q: 0.8, peak: 0.65, attack: 0.003, tail: 0.09 });
      thump(c, now, 170, 0.35, 0.09);
      break;
    case 'sort':
      // One tick of a riffle — short, light, high.
      paper(c, now, { freq: 4600, q: 1.4, peak: 0.32, attack: 0.002, tail: 0.035 });
      break;
    case 'select':
      // Picking a card up: the faintest slide.
      paper(c, now, { freq: 2600, q: 1.1, peak: 0.22, attack: 0.004, tail: 0.045 });
      break;
    case 'illegal':
      // A dull knock on the table — clearly "no", nothing papery about it.
      thump(c, now, 110, 0.5, 0.14);
      thump(c, now + 0.09, 95, 0.35, 0.12);
      break;
  }
}

/** A short haptic tap on supporting devices — tied to the same toggle. */
export function haptic(ms = 8): void {
  if (!soundEnabled()) return;
  navigator.vibrate?.(ms);
}

/** Play a tick and buzz together — the standard "something happened" feedback. */
export function feedback(kind: ClickKind, hapticMs = 8): void {
  playClick(kind);
  haptic(hapticMs);
}
