/**
 * Accessibility Audio & Haptic Feedback utilities for the Door Scanner.
 * Ensures gate personnel receive immediate multi-sensory confirmation
 * (tactile vibrations, crisp synthesized chimes, and visual cues)
 * even on low-brightness screens, noisy gate environments, or for color-blind operators.
 */

import { CheckInResultKind } from '@/types/ticketing';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Triggers hardware haptic vibration patterns if supported by the browser/device.
 */
export function triggerHapticFeedback(kind: CheckInResultKind): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  try {
    switch (kind) {
      case 'admitted':
        // Crisp, positive double-pulse
        navigator.vibrate([60, 40, 90]);
        break;

      case 'already_used':
        // Heavy, unmistakable warning pattern (buzz-buzz-BUZZ)
        navigator.vibrate([180, 80, 180, 80, 350]);
        break;

      case 'not_found':
        // Rapid triple error pulse
        navigator.vibrate([250, 70, 250, 70, 250]);
        break;

      case 'voided':
        // Sustained rejection buzz
        navigator.vibrate([400, 100, 200]);
        break;

      case 'unpaid':
        // Double medium warning pulse
        navigator.vibrate([120, 80, 120]);
        break;
    }
  } catch (err) {
    console.debug('Haptic feedback error:', err);
  }
}

/**
 * Plays synthesized multi-frequency chime or buzzer via Web Audio API.
 */
export function playAudioFeedback(kind: CheckInResultKind): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (kind === 'admitted') {
      // Pleasant rising high chime (880Hz -> 1174Hz / A5 -> D6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } else if (kind === 'already_used' || kind === 'voided' || kind === 'not_found') {
      // Low urgent dual-tone rejection buzzer (160Hz saw)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(120, now + 0.15);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } else if (kind === 'unpaid') {
      // Mid caution double-beep (440Hz -> 350Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';

      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(350, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (err) {
    console.debug('Audio feedback error:', err);
  }
}

/**
 * Fires full multi-sensory feedback (haptic + audio).
 */
export function fireScanFeedback(kind: CheckInResultKind): void {
  triggerHapticFeedback(kind);
  playAudioFeedback(kind);
}
