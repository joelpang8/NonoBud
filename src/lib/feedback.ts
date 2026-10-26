import { canVibrate, getSettings } from './settings';

/**
 * Small touches of sound and vibration. Sounds are synthesized (no audio files),
 * vibration uses the Vibration API (Android; iPhones don't offer it to web apps).
 */
export type Feel = 'fill' | 'mark' | 'erase' | 'win' | 'oops' | 'message';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, length: number, volume = 0.08): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const SOUNDS: Record<Feel, () => void> = {
  fill: () => tone(660, 0, 0.06),
  mark: () => tone(440, 0, 0.05, 0.06),
  erase: () => tone(330, 0, 0.05, 0.05),
  oops: () => (tone(300, 0, 0.09, 0.07), tone(240, 0.09, 0.12, 0.07)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, 0.09)),
  message: () => (tone(880, 0, 0.08, 0.06), tone(1175, 0.08, 0.12, 0.06)),
};

const BUZZ: Record<Feel, number | number[]> = {
  fill: 8,
  mark: 6,
  erase: 5,
  oops: [30, 40, 30],
  win: [20, 60, 20, 60, 60],
  message: [15, 50, 15],
};

export function feel(kind: Feel): void {
  const s = getSettings();
  if (s.sound) {
    try {
      SOUNDS[kind]();
    } catch {
      /* audio unavailable: stay silent */
    }
  }
  if (s.vibration && canVibrate()) navigator.vibrate(BUZZ[kind]);
}
