"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocalString } from "../cook-store";

const AudioCtor = () =>
  window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/** How long a finished timer rings: three-note chimes this far apart, until the flash ends (FLASH_MS) or it is dismissed. */
export const RING_EVERY_MS = 2_500;
export const RING_COUNT = 4;
const BUZZ = [400, 150, 400];

/** Three notes from `at` (seconds on the context clock) into `out`. */
function chime(ctx: AudioContext, out: AudioNode, at: number, notes = [880, 660, 880]) {
  for (const [i, hz] of notes.entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = at + i * 0.35;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/**
 * Events that may start sound. A touch's pointerdown is not a user activation in the HTML spec (its pointerup, touchend
 * and click are), so on an iPad only the later ones unlock the context; pointerdown and keydown cover mouse and keyboard.
 */
export const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

/** Resume a context that is suspended or interrupted; a refusal (no gesture yet) is fine, the next event tries again. */
function wake(ctx: AudioContext | null) {
  try {
    if (ctx && ctx.state !== "running") void ctx.resume?.()?.catch?.(() => {});
  } catch {
    // no sound is fine
  }
}

const noSubscribe = () => () => {};
/** Whether this browser can play sound, read after hydration (the server says no). */
function useAbilities() {
  return { sound: useSyncExternalStore(noSubscribe, () => Boolean(AudioCtor()), () => false) };
}

export type TimerAlert = {
  /** A timer finished: chime (unless muted) and buzz, for about ten seconds. */
  ring: () => void;
  /** Quiet now: the finished timer was dismissed. */
  stop: () => void;
  /** Sound on (the default) or muted, remembered on this device (`cook-sound`). */
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** False when this browser cannot play sound: the mute switch is not worth showing (vibration has no switch). */
  supported: boolean;
};

/**
 * The end-of-timer alert. Browsers only let sound start from a real gesture, so the audio context is made and resumed on
 * the first tap or key; until then a finished timer only flashes and buzzes. Vibration is Android's: iPad and iPhone
 * browsers have none, and an iPad on silent may keep the chime quiet too, so the flash is the alert that always works.
 * Each ring goes through its own gain node, so `stop` silences notes already scheduled. The context closes on unmount.
 */
export function useTimerAlert(): TimerAlert {
  const audio = useRef<AudioContext | null>(null);
  const ringing = useRef<GainNode | null>(null);
  const [stored, store] = useLocalString("cook-sound");
  const muted = stored === "off";
  const can = useAbilities();

  useEffect(() => {
    const unlock = () => {
      try {
        const AC = AudioCtor();
        if (!audio.current && AC) audio.current = new AC();
        wake(audio.current);
      } catch {
        // no sound is fine
      }
    };
    // iOS Safari leaves the context "interrupted" after the screen locks or the app goes to the background.
    const visible = () => document.visibilityState === "visible" && wake(audio.current);
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);
    document.addEventListener("visibilitychange", visible);
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
      document.removeEventListener("visibilitychange", visible);
      void audio.current?.close();
      audio.current = null;
      try {
        navigator.vibrate?.(0); // leaving cook mode ends a buzz too
      } catch {
        // nothing to stop
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      ringing.current?.disconnect();
      navigator.vibrate?.(0);
    } catch {
      // nothing to stop
    }
    ringing.current = null;
  }, []);

  const ring = useCallback(() => {
    try {
      ringing.current?.disconnect(); // a second timer ending restarts the ring; a new pattern replaces the buzz
      navigator.vibrate?.(Array.from({ length: RING_COUNT }, (_, i) => [...BUZZ, i < RING_COUNT - 1 ? RING_EVERY_MS - 950 : 0]).flat());
    } catch {
      // no vibration is fine
    }
    const ctx = audio.current;
    if (muted || !ctx) return;
    wake(ctx); // scheduled notes play once a suspended context resumes
    try {
      const out = ctx.createGain();
      out.connect(ctx.destination);
      for (let i = 0; i < RING_COUNT; i++) chime(ctx, out, ctx.currentTime + (i * RING_EVERY_MS) / 1000);
      ringing.current = out;
    } catch {
      // no sound is fine
    }
  }, [muted]);

  const setMuted = useCallback(
    (off: boolean) => {
      store(off ? "off" : "on");
      if (off) stop();
      // Turning sound on is a tap: one soft note says it works (and that the iPad is not on silent).
      else if (audio.current) {
        try {
          chime(audio.current, audio.current.destination, audio.current.currentTime, [880]);
        } catch {
          // no sound is fine
        }
      }
    },
    [store, stop],
  );

  return { ring, stop, muted, setMuted, supported: can.sound };
}
