'use client';
// Sound effects: recorded WAV samples from /public/sounds, played through WebAudio so they
// respect the volume setting and can overlap. Move and capture sounds rotate through several
// takes so repeated moves do not sound mechanical.
import { useSettings } from './store';

const TAKES = { 'move-self': 4, 'move-opponent': 4, capture: 8 } as const;
const SINGLES = ['castle', 'promote', 'illegal', 'notify', 'game-start', 'game-end', 'game-win', 'game-lose', 'game-draw', 'low-time'] as const;
const FILES = [...SINGLES, ...Object.entries(TAKES).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${k}-${i + 1}`))];

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;
const turn: Record<string, number> = {};

function ac() {
  if (typeof window === 'undefined') return null;
  try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Fetches and decodes every sample once. Called on the first interaction so the first move already has sound. */
export function preloadSounds() {
  const c = ac();
  if (!c) return Promise.resolve();
  return (loading ??= Promise.all(FILES.map(async (name) => {
    try {
      const data = await (await fetch(`/sounds/${name}.wav`)).arrayBuffer();
      buffers.set(name, await c.decodeAudioData(data));
    } catch { /* a missing sample just stays silent */ }
  })).then(() => {}));
}
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => { preloadSounds(); }, { once: true });

function sample(name: string, gain = 1, delay = 0) {
  const c = ac(), buf = buffers.get(name);
  const { volume } = useSettings.getState();
  if (!c) return;
  if (!buf) { preloadSounds(); return; }
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = buf; g.gain.value = volume * gain;
  src.connect(g).connect(c.destination); src.start(c.currentTime + delay);
}
const take = (kind: keyof typeof TAKES) => { turn[kind] = ((turn[kind] ?? -1) + 1) % TAKES[kind]; return `${kind}-${turn[kind] + 1}`; };

// The supplied set has no dedicated "check" sample, so check is the move knock plus a short synthesised alert tone.
function alertTone(c: AudioContext, volume: number) {
  const t = c.currentTime + 0.04;
  for (const [f, at] of [[880, 0], [1174, 0.09]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.16 * volume, t + at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16);
    o.connect(g).connect(c.destination); o.start(t + at); o.stop(t + at + 0.2);
  }
}

export type SoundName = 'move' | 'move-opponent' | 'capture' | 'castle' | 'promote' | 'check' | 'start' | 'end' | 'win' | 'lose' | 'draw' | 'error' | 'success' | 'notify' | 'lowtime';

export function play(name: SoundName) {
  const { sound, volume } = useSettings.getState();
  if (!sound || volume <= 0) return;
  switch (name) {
    case 'move': return sample(take('move-self'));
    case 'move-opponent': return sample(take('move-opponent'));
    case 'capture': return sample(take('capture'));
    case 'castle': return sample('castle');
    case 'promote': case 'success': return sample('promote', 0.8);
    case 'check': { const c = ac(); if (c) alertTone(c, volume); return; }
    case 'start': return sample('game-start');
    case 'end': return sample('game-end');
    case 'win': return sample('game-win');
    case 'lose': return sample('game-lose');
    case 'draw': return sample('game-draw');
    case 'error': return sample('illegal');
    case 'notify': return sample('notify');
    case 'lowtime': return sample('low-time');
  }
}

/** Plays the right sound for a move from its SAN. `mine` is false for the opponent's (or the engine's) moves. */
export function playMove(san: string, mine = true) {
  if (san.includes('x')) play('capture');
  else if (san.startsWith('O-O')) play('castle');
  else if (san.includes('=')) play('promote');
  else play(mine ? 'move' : 'move-opponent');
  // Check and checkmate both get the alert on top of the knock; the game-over sound follows from the page.
  if (san.includes('+') || san.includes('#')) play('check');
}

/** Game-over sound from the point of view of `you` (null for a spectator or an aborted game). */
export function playResult(result: string | null, you: 'w' | 'b' | null) {
  if (result === '1/2-1/2') play('draw');
  else if (!result || !you) play('end');
  else play((result === '1-0') === (you === 'w') ? 'win' : 'lose');
}
