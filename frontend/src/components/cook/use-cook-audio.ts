"use client";

import { useCallback, useEffect, useRef } from "react";

const AudioCtor = () =>
  window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/** A short chime on a context that a tap already created and resumed (iOS keeps it silent otherwise). */
function chime(ctx: AudioContext) {
  try {
    for (const [i, hz] of [880, 660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.35;
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  } catch {
    // no sound is fine
  }
}

/**
 * The timer chime. Browsers only let sound start from a real gesture, so the audio context is made and resumed on the first
 * tap or key; the returned function plays the chime on it (nothing before that gesture). The context closes on unmount.
 */
export function useCookAudio(): () => void {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        const AC = AudioCtor();
        if (!audio.current && AC) audio.current = new AC();
        if (audio.current && audio.current.state !== "running") void audio.current.resume?.();
      } catch {
        // no sound is fine
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  return useCallback(() => {
    if (audio.current) chime(audio.current);
  }, []);
}
