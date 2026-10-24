"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import {
  CookColumns, CookFooter, CookLive, CookMention, CookPill, CookPillLink, CookProgress, CookRail, CookRailRow, CookStage,
  CookStepItem, CookStepList, CookStepText, CookTextButton, CookTick, CookTimer, CookTimerButton, CookTimers, CookToolbar,
  CookTopBar, CookViewToggle, CookVoiceToggle, CookWakeStatus,
} from "@/components/ui/CookKit";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { splitIngredient } from "@/lib/scale";
import {
  clampStep, cookParts, formatClock, litIngredients, noTimers, railOrder, remainingMs, ringFraction, stepDurations, swipeDirection, timerReducer,
} from "./cook-logic";
import { useCookTicks, useCookView } from "./cook-store";
import { useVoice } from "./use-voice";
import { useWakeLock } from "./use-wake-lock";

type Props = { id: string; title: string; ingredients: string[]; steps: string[] };

const AudioCtor = () =>
  window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
const FLASH_MS = 10_000;
const LEADING_PUNCTUATION = /^[.,;:!?)\]]+/;

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

/** "Step 2 · 12 min": short enough for the ring. */
const timerLabel = (step: number, text: string) => `Step ${step} · ${text.replace(/\s*minutes?\b/i, " min").replace(/\s*hours?\b/i, " hr")}`;

/**
 * Cook mode: one step at a time, or every step in a list. Step index and timers live here, above the step view, so
 * timers keep running when the step changes. Ticks are kept per recipe on this device (cook-store.ts); the screen wake
 * lock is use-wake-lock.ts.
 */
export function CookMode({ id, title, ingredients, steps }: Props) {
  const [index, setIndex] = useState(0);
  const [timers, dispatch] = useReducer(timerReducer, noTimers);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState({ text: "" });
  const audio = useRef<AudioContext | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const announced = useRef(new Set<number>());

  const count = steps.length;
  const [view, setView] = useCookView();
  const all = view === "all";
  const { ticks, toggleIngredient, toggleStep, clear } = useCookTicks(id, ingredients.length, count);
  const wake = useWakeLock();
  // The same words twice in a row get a trailing no-break space, so it is a new change and a screen reader says them again.
  const announce = useCallback((text: string) => setLive((l) => ({ text: l.text === text ? `${text}\u00a0` : text })), []);
  const go = useCallback(
    (by: number) => {
      if (all) return; // arrows, swipes and voice move through the one-step view only
      const to = clampStep(index + by, count);
      if (to === index) return;
      setIndex(to);
      announce(`Step ${to + 1} of ${count}: ${steps[to]}`);
    },
    [all, index, count, steps, announce],
  );

  const running = timers.timers.some((t) => !t.done);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 500);
    return () => clearInterval(tick);
  }, [running]);

  // A finished timer flashes for ten seconds, then stays claret; the re-render stops with the flashing.
  const flashing = timers.timers.some((t) => t.done && now - t.endsAt < FLASH_MS);
  useEffect(() => {
    if (!flashing) return;
    const flip = setInterval(() => setNow(Date.now()), 600);
    return () => clearInterval(flip);
  }, [flashing]);

  useEffect(() => {
    const fresh = timers.timers.filter((t) => t.done && !announced.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) announced.current.add(t.id);
    // Announcing and chiming are side effects of a timer finishing, not derived state.
    announce(`Timer finished: ${fresh.map((t) => t.label).join(", ")}`);
    if (audio.current) chime(audio.current);
  }, [timers, announce]);

  useEffect(() => {
    // Browsers only let sound start from a real gesture: make and resume the context on the first tap or key.
    const unlock = () => {
      try {
        const AC = AudioCtor();
        if (!audio.current && AC) audio.current = new AC();
        if (audio.current && audio.current.state !== "running") void audio.current.resume?.();
      } catch {
        // no sound is fine
      }
    };
    const key = (e: KeyboardEvent) => {
      unlock();
      if (e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], [role=slider], [role=radiogroup]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", key);
    };
  }, [go]);
  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );

  const startTimer = useCallback((step: number, text: string, seconds: number) => {
    const t = Date.now();
    const label = timerLabel(step + 1, text);
    // A double tap on the chip is one timer.
    if (timers.timers.some((x) => x.label === label && x.totalMs === seconds * 1000 && t - (x.endsAt - x.totalMs) < 1500)) return;
    setNow(t);
    dispatch({ type: "start", label, seconds, now: t });
  }, [timers.timers]);

  const stepText = steps[index] ?? "";
  const voice = useVoice((c) => {
    if (c === "repeat") announce(stepText);
    else go(c === "next" ? 1 : -1);
  });

  if (count === 0) {
    return (
      <CookStage>
        <EmptyState title="This recipe has no steps yet" level={1} actions={<ButtonLink href={`/recipes/${id}/edit`}>Edit recipe</ButtonLink>}>
          Add the method and cook mode will walk you through it.
        </EmptyState>
        <ButtonLink href={`/recipes/${id}`} variant="secondary" className="mt-6 self-start">
          Back to the recipe
        </ButtonLink>
      </CookStage>
    );
  }

  const renderStep = (at: number): ReactNode => {
  const parts = cookParts(steps[at], ingredients);
  return parts.map((part, i) => {
      if (part.kind === "ingredient") return <CookMention key={i}>{part.text}</CookMention>;
      if (part.kind === "timer") {
        const d = stepDurations(part.text)[0];
        if (!d) return part.text;
        // Keep the full stop that follows on the chip's line.
        const next = parts[i + 1];
        const after = (next?.kind === "text" && LEADING_PUNCTUATION.exec(next.text)?.[0]) || "";
        return (
          <CookTimerButton key={i} after={after} aria-label={`Start timer: ${part.text}`} onClick={() => startTimer(at, d.label, d.seconds)}>
            {part.text}
          </CookTimerButton>
        );
      }
      const prev = parts[i - 1];
      return prev?.kind === "timer" && stepDurations(prev.text)[0] ? part.text.replace(LEADING_PUNCTUATION, "") : part.text;
    });
  };

  const lit = litIngredients(stepText, ingredients);
  const next = steps[index + 1];
  const phase = Math.floor(now / 600) % 2 === 0;
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    // Not from a control, and not a pinch.
    swipe.current = e.touches.length > 1 || (e.target instanceof Element && e.target.closest("button, a, input, select, textarea, [role=slider]")) ? null : { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = swipe.current;
    swipe.current = null;
    const t = e.changedTouches[0];
    if (!from || !t || e.touches.length > 0) return;
    const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y);
    if (dir) go(dir === "next" ? 1 : -1);
  };

  return (
    <CookStage onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => (swipe.current = null)}>
      <CookTopBar closeHref={`/recipes/${id}`} onClose={(e) => !timers.timers.some((t) => !t.done) || window.confirm("A timer is still running. Leave cook mode?") || e.preventDefault()} title={title}>
        {voice.supported && <CookVoiceToggle listening={voice.listening} onClick={voice.toggle} />}
      </CookTopBar>
      <CookProgress count={count} current={index} done={ticks.steps} />
      <CookToolbar>
        <CookViewToggle all={all} onChange={(on) => setView(on ? "all" : "one")} />
        <div className="flex flex-wrap items-center gap-x-2">
          {(ticks.ingredients.size > 0 || ticks.steps.size > 0) && <CookTextButton onClick={clear}>Clear ticks</CookTextButton>}
          <CookWakeStatus
            on={wake === "on"}
            note={
              wake === "unsupported"
                ? "This browser cannot keep the screen awake. On an iPad, use the Home Screen app (iPadOS 18.4 or later), or set Auto-Lock to Never in Settings while you cook."
                : "The screen could not be kept awake just now. On an iPad, use the Home Screen app (iPadOS 18.4 or later), or set Auto-Lock to Never in Settings while you cook."
            }
          />
        </div>
      </CookToolbar>
      <CookColumns
        rail={
          <CookRail hiddenCount={ingredients.length - lit.size} anyLit={lit.size > 0}>
            {ingredients.length === 0 ? (
              <li>
                <Text variant="small">No ingredients listed.</Text>
              </li>
            ) : (
              railOrder(ingredients.length, lit).map(({ index: i, lit: on }) => {
                const { quantity, rest } = splitIngredient(ingredients[i]);
                return <CookRailRow key={i} quantity={quantity ?? ""} name={rest} lit={on} ticked={ticks.ingredients.has(i)} onToggle={() => toggleIngredient(i)} />;
              })
            )}
          </CookRail>
        }
        step={
          all ? (
            <CookStepList>
              {steps.map((_, i) => (
                <CookStepItem
                  key={i}
                  number={i + 1}
                  current={i === index}
                  done={ticks.steps.has(i)}
                  tick={
                    <CookTick
                      pressed={ticks.steps.has(i)}
                      aria-label={`Step ${i + 1} done`}
                      onClick={() => {
                        // Ticking a step makes the next one current.
                        if (!ticks.steps.has(i)) setIndex(clampStep(i + 1, count));
                        toggleStep(i);
                      }}
                    >
                      Done
                    </CookTick>
                  }
                >
                  {renderStep(i)}
                </CookStepItem>
              ))}
            </CookStepList>
          ) : (
            <CookStepText
              label={`Step ${index + 1} of ${count}`}
              action={
                <CookTick pressed={ticks.steps.has(index)} aria-label={`Step ${index + 1} done`} onClick={() => toggleStep(index)}>
                  Done
                </CookTick>
              }
            >
              {renderStep(index)}
            </CookStepText>
          )
        }
        timers={
          <CookTimers empty="Tap a time in the step to start a timer.">
            {timers.timers.map((t, i) => (
              <CookTimer
                key={t.id}
                label={t.label}
                digits={formatClock(remainingMs(t, now))}
                fraction={ringFraction(t, now)}
                done={t.done}
                flash={t.done && now - t.endsAt >= FLASH_MS ? true : phase}
                large={i < 3}
                small={i > 0}
                onDismiss={() => dispatch({ type: "dismiss", id: t.id })}
              />
            ))}
          </CookTimers>
        }
      />
      <CookLive>{live.text}</CookLive>
      <CookFooter next={next} summary={all ? `${ticks.steps.size} of ${count} steps done` : undefined}>
        {all ? (
          <CookPillLink href={`/recipes/${id}`}>Finish</CookPillLink>
        ) : (
          <>
            <CookPill variant="secondary" disabled={index === 0} onClick={() => go(-1)}>
              ← Back
            </CookPill>
            {next === undefined ? (
              <CookPillLink href={`/recipes/${id}`}>Finish</CookPillLink>
            ) : (
              <CookPill onClick={() => go(1)}>Next step →</CookPill>
            )}
          </>
        )}
      </CookFooter>
    </CookStage>
  );
}
