import { useCallback, useRef } from 'react';

let audioCtx: AudioContext | null = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playClick() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch {
  }
}

function vibrate() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  } catch {
  }
}

export function useClickFeedback() {
  return useCallback(() => {
    playClick();
    vibrate();
  }, []);
}

export { playClick, vibrate };
