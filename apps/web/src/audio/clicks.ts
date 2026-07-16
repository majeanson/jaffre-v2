/**
 * Tiny Web Audio click engine — short synthesized ticks for a tactile,
 * phone-like feel. Off by default (opt-in via the sound toggle). The
 * AudioContext is created lazily and resumed on the first user gesture to
 * satisfy the browser autoplay policy. No asset files: every tick is
 * synthesized, with a little pitch jitter so a cascade sounds organic.
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

// Resume the context on the first user gesture while sound is on.
if (typeof window !== 'undefined') {
  const resume = (): void => {
    if (soundEnabled() && ctx !== null && ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', resume, { passive: true });
  window.addEventListener('keydown', resume, { passive: true });
}

const FREQ: Record<ClickKind, number> = {
  deal: 660,
  play: 520,
  sort: 880,
  select: 1000,
  illegal: 150,
};

/** Play a short percussive tick. No-op unless sound is enabled. */
export function playClick(kind: ClickKind): void {
  if (!soundEnabled()) return;
  const c = ensureCtx();
  if (c === null || master === null) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = kind === 'illegal' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(FREQ[kind] * (0.93 + Math.random() * 0.14), now);
  const peak = kind === 'illegal' ? 0.5 : 0.7;
  const tail = kind === 'illegal' ? 0.12 : 0.055;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + tail);
  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + tail + 0.02);
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
