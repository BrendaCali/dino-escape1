/** Efectos de sonido sintetizados con WebAudio (sin archivos). Suaves y cortos. */
export type Sfx = 'click' | 'place' | 'remove' | 'rotate' | 'run' | 'portal' | 'error' | 'win' | 'fuse' | 'boom';

let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.6;

export const setSound = (on: boolean, vol: number) => {
  enabled = on;
  volume = vol;
};

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  const v = Math.max(0.0001, gain * volume);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(v, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, gain: number) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700;
  s.buffer = buf;
  g.gain.value = gain * volume;
  s.connect(f).connect(g).connect(c.destination);
  s.start(c.currentTime + start);
}

export function play(name: Sfx) {
  const c = ac();
  if (!c) return;
  switch (name) {
    case 'click':
      tone(c, 520, 0, 0.06, 'triangle', 0.18);
      break;
    case 'place':
      tone(c, 300, 0, 0.09, 'triangle', 0.3, 190);
      break;
    case 'remove':
      tone(c, 260, 0, 0.1, 'triangle', 0.25, 380);
      break;
    case 'rotate':
      tone(c, 440, 0, 0.05, 'square', 0.1);
      tone(c, 560, 0.05, 0.05, 'square', 0.1);
      break;
    case 'run':
      tone(c, 392, 0, 0.1, 'triangle', 0.25);
      tone(c, 523, 0.1, 0.14, 'triangle', 0.25);
      break;
    case 'portal':
      tone(c, 300, 0, 0.3, 'sine', 0.25, 900);
      break;
    case 'error':
      tone(c, 220, 0, 0.18, 'sawtooth', 0.18, 140);
      tone(c, 160, 0.18, 0.22, 'sawtooth', 0.18, 100);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.11, 0.22, 'triangle', 0.28));
      break;
    case 'fuse':
      noise(c, 0, 0.6, 0.12);
      break;
    case 'boom':
      noise(c, 0, 0.7, 0.55);
      tone(c, 120, 0, 0.5, 'sine', 0.5, 40);
      break;
  }
}
