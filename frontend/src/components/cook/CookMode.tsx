"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CookColumns, CookFooter, CookLive, CookPill, CookPillLink, CookProgress, CookRail, CookRailRow, CookStage,
  CookStepItem, CookStepList, CookStepText, CookTextButton, CookTick, CookSoundToggle, CookToolbar, CookTopBar, CookViewToggle, CookVoiceToggle,
} from "@/components/ui/CookKit";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { splitIngredient } from "@/lib/scale";
import { timerLabel } from "@/lib/timers";
import { clampStep, litIngredients, railOrder } from "./cook-logic";
import { renderCookStep } from "./cook-step";
import { readCookTicks, useCookTicks, useCookView } from "./cook-store";
import { useCookWake } from "./CookWake";
import { useAnnounce, useStepKeys, useSwipe } from "./use-cook-controls";
import { CookTimerRack } from "./timers/CookTimerRack";
import { useCookTimers } from "./timers/use-cook-timers";
import { useVoice } from "./use-voice";

type Props = { id: string; title: string; ingredients: string[]; steps: string[] };

/**
 * Cook mode: one step at a time, or every step in a list. Step index and timers live here, above the step view, so
 * timers keep running when the step changes. Ticks are kept per recipe on this device (cook-store.ts); the screen wake
 * lock is use-wake-lock.ts; timers, the chime, announcements, keys and swipes are shared with cook-together (use-cook-*.ts).
 */
export function CookMode({ id, title, ingredients, steps }: Props) {
  const [index, setIndex] = useState(0);
  const [live, announce] = useAnnounce();
  const { timers, now, running, start, dismiss, alert } = useCookTimers(announce);

  const count = steps.length;
  const [view, setView] = useCookView();
  const all = view === "all";
  const { ticks, toggleIngredient, toggleStep, clear } = useCookTicks(id, ingredients.length, count);
  // Once, after mount: open on the first step not yet done (a reloaded Home Screen app picks up where the cook was).
  // Reads the store directly, so a later tick or another tab's write never moves the step.
  useEffect(() => {
    const done = readCookTicks(id, ingredients.length, count).steps;
    if (done.size === 0) return;
    let first = 0;
    while (first < count - 1 && done.has(first)) first++;
    // Not a lazy useState initial: the server cannot read the store, and the first client render must match its HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
  }, []);
  const wake = useCookWake();
  const toolbar = useRef<HTMLDivElement>(null);
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
  useStepKeys(go);
  const swipe = useSwipe(go);

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

  const renderStep = (at: number) =>
    renderCookStep(steps[at], ingredients, String(at), { timers, now, start: (key, text, seconds) => start(key, timerLabel(at + 1, text), seconds) });

  const lit = litIngredients(stepText, ingredients);
  const next = steps[index + 1];
  return (
    <CookStage {...swipe}>
      <CookTopBar closeHref={`/recipes/${id}`} onClose={(e) => !running || window.confirm("A timer is still running. Leave cook mode?") || e.preventDefault()} title={title}>
        {voice.supported && <CookVoiceToggle listening={voice.listening} onClick={voice.toggle} />}
      </CookTopBar>
      <CookProgress count={count} current={index} done={ticks.steps} />
      <CookToolbar ref={toolbar}>
        <CookViewToggle all={all} onChange={(on) => setView(on ? "all" : "one")} />
        <div className="flex flex-wrap items-center gap-x-2">
          {(ticks.ingredients.size > 0 || ticks.steps.size > 0) && (
            <CookTextButton
              onClick={() => {
                clear();
                toolbar.current?.focus(); // the button goes away; keep focus inside the stage
              }}
            >
              Clear ticks
            </CookTextButton>
          )}
          {alert.supported && <CookSoundToggle muted={alert.muted} onChange={alert.setMuted} />}
          {wake.status}
        </div>
        {wake.note}
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
                        // Ticking the current step makes the next one current; any other step leaves the list where it is.
                        if (i === index && !ticks.steps.has(i)) setIndex(clampStep(i + 1, count));
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
        timers={<CookTimerRack timers={timers} now={now} onDismiss={dismiss} />}
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
