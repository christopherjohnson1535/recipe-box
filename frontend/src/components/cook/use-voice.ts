"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseVoice } from "./cook-logic";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
};
type Ctor = new () => Recognition;

const ctor = (): Ctor | null => {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noop = () => () => {};

/**
 * Optional voice commands ("next", "back", "repeat"). `supported` is false on the server and where the browser has no
 * speech recognition, so the toggle is hidden there. Every failure (denied microphone, no network) switches it off
 * quietly.
 */
export function useVoice(onCommand: (c: "next" | "back" | "repeat") => void) {
  const supported = useSyncExternalStore(noop, () => ctor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  });

  useEffect(() => {
    const Recognizer = listening ? ctor() : null;
    if (!Recognizer) return;
    let alive = true;
    const rec = new Recognizer();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const command = parseVoice(e.results[i][0].transcript);
        if (command) handler.current(command);
      }
    };
    const stopListening = () => {
      alive = false;
      setListening(false);
    };
    // Only a refused microphone ends it; "no-speech" and "aborted" are routine in a quiet kitchen and fall through to onend.
    rec.onerror = (e) => {
      if (e?.error === undefined || e.error === "not-allowed" || e.error === "service-not-allowed") stopListening();
    };
    let restarts: number[] = [];
    let restart: ReturnType<typeof setTimeout> | undefined;
    rec.onend = () => {
      if (!alive) return;
      const t = Date.now();
      restarts = [...restarts.filter((r) => t - r < 5000), t];
      if (restarts.length > 5) return stopListening(); // starts that end at once: give up rather than loop
      restart = setTimeout(() => {
        try {
          rec.start(); // browsers end a session after a pause; keep listening while the toggle is on
        } catch {
          stopListening();
        }
      }, 300);
    };
    try {
      rec.start();
    } catch {
      alive = false;
      queueMicrotask(() => setListening(false));
    }
    return () => {
      alive = false;
      clearTimeout(restart);
      rec.onend = rec.onerror = rec.onresult = null;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    };
  }, [listening]);

  const toggle = useCallback(() => setListening((l) => !l), []);
  return { supported, listening, toggle };
}
