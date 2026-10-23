"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseVoice } from "./cook-logic";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
    rec.onerror = () => {
      alive = false;
      setListening(false);
    };
    rec.onend = () => {
      if (!alive) return;
      try {
        rec.start(); // browsers end a session after a pause; keep listening while the toggle is on
      } catch {
        setListening(false);
      }
    };
    try {
      rec.start();
    } catch {
      alive = false;
      queueMicrotask(() => setListening(false));
    }
    return () => {
      alive = false;
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
