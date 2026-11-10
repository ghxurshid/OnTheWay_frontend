/* Incoming-call alert: a repeating two-tone ring (Web Audio — no asset to
   load), device vibration and Telegram haptics. Every part is best-effort:
   a WebView without audio permission still vibrates, and vice versa. */

import { haptic } from '@/services/telegram';

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function beep(audio: AudioContext, at: number, freq: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + 0.4);
}

function ring() {
  haptic('warning');
  try { navigator.vibrate?.([350, 200, 350]); } catch { /* unsupported */ }
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  beep(ctx, now, 480);
  beep(ctx, now + 0.45, 620);
}

/** Start ringing (repeats every 2.5 s until stopRingtone). */
export function startRingtone(): void {
  stopRingtone();
  try {
    const Ctor: AudioCtor | undefined = window.AudioContext
      || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  ring();
  timer = setInterval(ring, 2500);
}

export function stopRingtone(): void {
  if (timer) { clearInterval(timer); timer = null; }
  try { navigator.vibrate?.(0); } catch { /* unsupported */ }
  ctx?.close().catch(() => {});
  ctx = null;
}
