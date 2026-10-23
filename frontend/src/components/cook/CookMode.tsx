"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { annotateStep } from "@/components/recipe-page/mentions";
import {
  CookColumns, CookFooter, CookLive, CookMention, CookPill, CookPillLink, CookProgress, CookRail, CookRailRow, CookStage,
  CookStepText, CookTimer, CookTimerButton, CookTimers, CookTopBar, CookVoiceToggle,
} from "@/components/ui/CookKit";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { splitIngredient } from "@/lib/scale";
import {
  clampStep, formatClock, litIngredients, noTimers, railOrder, remainingMs, ringFraction, stepDurations, swipeDirection, timerReducer,
} from "./cook-logic";
import { useVoice } from "./use-voice";

type Props = { id: string; title: string; ingredients: string[]; steps: string[] };

/** A short chime. Only called after the person has touched the page, which is what browsers require for sound. */
function chime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
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
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // no sound is fine
  }
}

/**
 * Cook mode: one step at a time. Step index and timers live here, above the step view, so timers keep running when
 * the step changes. Tick-off and the screen wake lock belong to #13.
 */
export function CookMode({ id, title, ingredients, steps }: Props) {
  const [index, setIndex] = useState(0);
  const [timers, dispatch] = useReducer(timerReducer, noTimers);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const touched = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const announced = useRef(new Set<number>());

  const count = steps.length;
  const move = useCallback((by: number) => setIndex((i) => clampStep(i + by, count)), [count]);

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

  const hasDone = timers.timers.some((t) => t.done);
  useEffect(() => {
    if (!hasDone) return;
    const flip = setInterval(() => setNow(Date.now()), 600);
    return () => clearInterval(flip);
  }, [hasDone]);

  useEffect(() => {
    const fresh = timers.timers.filter((t) => t.done && !announced.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) announced.current.add(t.id);
    // Announcing and chiming are side effects of a timer finishing, not derived state.
    setAnnouncement(`Timer finished: ${fresh.map((t) => t.label).join(", ")}`);
    if (touched.current) chime();
  }, [timers]);

  useEffect(() => {
    const mark = () => {
      touched.current = true;
    };
    const key = (e: KeyboardEvent) => {
      mark();
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target instanceof Element && target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", key);
    };
  }, [move]);

  const startTimer = useCallback(
    (label: string, seconds: number) => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "start", label: `Step ${index + 1}: ${label}`, seconds, now: t });
    },
    [index],
  );

  const stepText = steps[index] ?? "";
  const voice = useVoice((c) => {
    if (c === "repeat") setAnnouncement(`${stepText} `); // trailing space so a repeat is read again
    else move(c === "next" ? 1 : -1);
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

  const lit = litIngredients(stepText, ingredients);
  const next = steps[index + 1];
  const flash = Math.floor(now / 600) % 2 === 0;

  return (
    <CookStage>
      <CookTopBar closeHref={`/recipes/${id}`} title={title}>
        {voice.supported && <CookVoiceToggle listening={voice.listening} onClick={voice.toggle} />}
      </CookTopBar>
      <CookProgress count={count} current={index} />
      <CookColumns
        rail={
          <CookRail>
            {ingredients.length === 0 ? (
              <li>
                <Text variant="small">No ingredients listed.</Text>
              </li>
            ) : (
              railOrder(ingredients.length, lit).map(({ index: i, lit: on }) => {
                const { quantity, rest } = splitIngredient(ingredients[i]);
                return <CookRailRow key={i} quantity={quantity ?? ""} name={rest} lit={on} />;
              })
            )}
          </CookRail>
        }
        step={
          <CookStepText
            label={`Step ${index + 1} of ${count}`}
            onTouchStart={(e) => {
              swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              const from = swipe.current;
              swipe.current = null;
              if (!from) return;
              const dir = swipeDirection(e.changedTouches[0].clientX - from.x, e.changedTouches[0].clientY - from.y);
              if (dir) move(dir === "next" ? 1 : -1);
            }}
          >
            {annotateStep(stepText, ingredients).map((part, i) => {
              if (part.kind === "ingredient") return <CookMention key={i}>{part.text}</CookMention>;
              if (part.kind === "timer") {
                const d = stepDurations(part.text)[0];
                return d ? (
                  <CookTimerButton key={i} aria-label={`Start timer: ${part.text}`} onClick={() => startTimer(d.label, d.seconds)}>
                    {part.text}
                  </CookTimerButton>
                ) : (
                  part.text
                );
              }
              return part.text;
            })}
          </CookStepText>
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
                flash={flash}
                large={i === 0}
                onDismiss={() => dispatch({ type: "dismiss", id: t.id })}
              />
            ))}
          </CookTimers>
        }
      />
      <CookLive>{announcement}</CookLive>
      <CookFooter next={next}>
        <CookPill variant="secondary" disabled={index === 0} onClick={() => move(-1)}>
          ← Back
        </CookPill>
        {next === undefined ? (
          <CookPillLink href={`/recipes/${id}`}>Finish</CookPillLink>
        ) : (
          <CookPill onClick={() => move(1)}>Next step →</CookPill>
        )}
      </CookFooter>
    </CookStage>
  );
}
