"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  CookColumns, CookDishColumn, CookDishColumns, CookDishLegend, CookDishMark, CookDishTabs, CookFooter, CookLive, CookMoveButtons, CookNudge,
  CookPill, CookPillLink, CookProgress, CookRail, CookRailRow, CookReorderList, CookStage, CookStepItem, CookStepText, CookTextButton, CookTick,
  CookToolbar, CookTopBar, CookViewChoice, CookVoiceToggle,
} from "@/components/ui/CookKit";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { splitIngredient } from "@/lib/scale";
import { clampStep, litIngredients, railOrder } from "./cook-logic";
import { renderCookStep } from "./cook-step";
import { bringNext, canMove, dishInitials, firstOpen, interleave, move, nextOfDish, type DishStep } from "./cook-together-logic";
import { readCookTicks, readCookTogetherOrder, useCookTogetherOrder, useCookTogetherView, useDishTicks, type CookTogetherView } from "./cook-store";
import { CookTimerRack } from "./CookTimerRack";
import { useCookWake } from "./CookWake";
import { useCookAudio } from "./use-cook-audio";
import { useAnnounce, useStepKeys, useSwipe } from "./use-cook-controls";
import { timerLabel, useCookTimers } from "./use-cook-timers";
import { useVoice } from "./use-voice";

export type Dish = { id: string; title: string; ingredients: string[]; steps: string[] };

const VIEWS: { id: CookTogetherView; label: string }[] = [
  { id: "one", label: "One step" },
  { id: "all", label: "All steps" },
  { id: "dishes", label: "By dish" },
];

/**
 * Cook two to four recipes at once. One combined order of steps (round-robin to begin with; the cook can move steps and pull a
 * dish's next step forward), shown one step at a time, as one list, or in a column per dish. Order, step index and timers live
 * here, above the views, so timers keep running when the step or the view changes. Ticks are each recipe's own (cook-store.ts),
 * so they are shared with single-recipe cook mode.
 */
export function CookTogether({ dishes }: { dishes: Dish[] }) {
  const ids = dishes.map((d) => d.id);
  const stepCounts = dishes.map((d) => d.steps.length);
  const marks = dishInitials(dishes.map((d) => d.title));
  const [index, setIndex] = useState(0);
  const [live, announce] = useAnnounce();
  const chime = useCookAudio();
  const { timers, now, running, start, dismiss } = useCookTimers(announce, chime);
  const [view, setView] = useCookTogetherView();
  const { order, setOrder } = useCookTogetherOrder(ids, stepCounts);
  const { ticks, toggleIngredient, toggleStep, clearAll } = useDishTicks(
    dishes.map((d) => ({ id: d.id, ingredientCount: d.ingredients.length, stepCount: d.steps.length })),
  );
  const wake = useCookWake();
  const toolbar = useRef<HTMLDivElement>(null);

  // Once, after mount: open on the first step of the order not yet done (a reloaded Home Screen app picks up where the cook was).
  // Reads the store directly, so a later tick or another tab's write never moves the step.
  useEffect(() => {
    const done = dishes.map((d) => readCookTicks(d.id, d.ingredients.length, d.steps.length).steps);
    const first = firstOpen(readCookTogetherOrder(ids, stepCounts), done);
    // Not a lazy useState initial: the server cannot read the store, and the first client render must match its HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first > 0) setIndex(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
  }, []);

  const total = order.length;
  const at = clampStep(index, total);
  const here = order[at] as DishStep | undefined;
  const isDone = (e: DishStep) => ticks[e.dish]?.steps.has(e.step) ?? false;
  const textOf = (e: DishStep) => dishes[e.dish].steps[e.step];
  const nameOf = (dish: number) => dishes[dish].title;
  const describe = (e: DishStep) => `${nameOf(e.dish)}, step ${e.step + 1} of ${dishes[e.dish].steps.length}: ${textOf(e)}`;
  const mark = (dish: number, size: "sm" | "md") => <CookDishMark dish={dish} initial={marks[dish]} name={nameOf(dish)} size={size} />;

  // The rail's tab follows the current step's dish when that changes; the cook can still look at another dish meanwhile.
  const currentDish = here?.dish ?? 0;
  const [followed, setFollowed] = useState(currentDish);
  const [railDish, setRailDish] = useState(currentDish);
  if (followed !== currentDish) {
    setFollowed(currentDish);
    setRailDish(currentDish);
  }

  const go = useCallback(
    (by: number) => {
      if (view !== "one") return; // arrows, swipes and voice move through the one-step view only
      const to = clampStep(index + by, total);
      if (to === index) return;
      setIndex(to);
      announce(describe(order[to]));
    },
    // describe only reads props
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, index, total, order, announce],
  );
  useStepKeys(go);
  const swipe = useSwipe(go);
  const voice = useVoice((c) => {
    if (c === "repeat") announce(here ? describe(here) : "");
    else go(c === "next" ? 1 : -1);
  });

  // The current step is the same step after a reorder, wherever it ended up.
  const apply = (next: readonly DishStep[]) => {
    setOrder(next);
    if (here) setIndex(next.findIndex((e) => e.dish === here.dish && e.step === here.step));
  };
  const moveStep = (pos: number, dir: -1 | 1) => {
    const next = move(order, pos, dir);
    if (next === order) return;
    const e = order[pos];
    apply(next);
    announce(`Moved ${nameOf(e.dish)} step ${e.step + 1} ${dir < 0 ? "earlier" : "later"}, now ${pos + dir + 1} of ${total}`);
  };
  const bring = (dish: number) => {
    const from = nextOfDish(order, at, dish);
    const next = bringNext(order, at, dish);
    if (from === -1) return;
    if (next !== order) apply(next);
    announce(`${nameOf(dish)} step ${order[from].step + 1} is next`);
  };
  // Ticking the current step makes the next one current (as in cook mode); any other step leaves the list where it is.
  const tickAt = (pos: number) => {
    const e = order[pos];
    if (pos === at && !isDone(e)) setIndex(clampStep(pos + 1, total));
    toggleStep(e.dish, e.step);
  };

  const renderStep = (e: DishStep) =>
    renderCookStep(textOf(e), dishes[e.dish].ingredients, (text, seconds) => start(timerLabel(e.step + 1, text, nameOf(e.dish)), seconds));
  const tick = (e: DishStep, onClick: () => void) => (
    <CookTick pressed={isDone(e)} aria-label={`${nameOf(e.dish)} step ${e.step + 1} done`} onClick={onClick}>
      Done
    </CookTick>
  );

  const finishHref = `/recipes/${dishes[0].id}`;
  if (total === 0) {
    return (
      <CookStage>
        <EmptyState title="These recipes have no steps yet" level={1} actions={<ButtonLink href={`/recipes/${dishes[0].id}/edit`}>Edit {dishes[0].title}</ButtonLink>}>
          Add the method and cook mode will walk you through it.
        </EmptyState>
        <ButtonLink href={finishHref} variant="secondary" className="mt-6 self-start">
          Back to the recipe
        </ButtonLink>
      </CookStage>
    );
  }

  const doneCount = order.filter(isDone).length;
  const doneAt = new Set(order.flatMap((e, pos) => (isDone(e) ? [pos] : [])));
  const anyTicked = ticks.some((t) => t.ingredients.size > 0 || t.steps.size > 0);
  const roundRobin = interleave(stepCounts);
  const reordered = order.some((e, pos) => e.dish !== roundRobin[pos].dish || e.step !== roundRobin[pos].step);

  const current = order[at];
  const next = order[at + 1];
  const railIngredients = dishes[railDish].ingredients;
  const lit = railDish === current.dish ? litIngredients(textOf(current), railIngredients) : new Set<number>();

  const oneStep = (
    <>
      <CookStepText
        dish={mark(current.dish, "md")}
        label={`Step ${current.step + 1} of ${dishes[current.dish].steps.length} · ${at + 1} of ${total} overall`}
        action={tick(current, () => toggleStep(current.dish, current.step))}
      >
        {renderStep(current)}
      </CookStepText>
      <div className="mt-6 flex flex-col items-start gap-1">
        {dishes.map((_, dish) =>
          dish !== current.dish && nextOfDish(order, at, dish) !== -1 ? (
            <CookNudge key={dish} mark={mark(dish, "sm")} onClick={() => bring(dish)}>
              Bring {nameOf(dish)}’s next step here
            </CookNudge>
          ) : null,
        )}
      </div>
    </>
  );

  const allSteps = (
    <CookReorderList>
      {order.map((e, pos) => (
        <CookStepItem
          key={`${e.dish}:${e.step}`}
          number={pos + 1}
          current={pos === at}
          done={isDone(e)}
          dish={mark(e.dish, "sm")}
          tick={tick(e, () => tickAt(pos))}
          controls={
            <CookMoveButtons
              stepLabel={`${nameOf(e.dish)} step ${e.step + 1}`}
              canEarlier={canMove(order, pos, -1)}
              canLater={canMove(order, pos, 1)}
              onEarlier={() => moveStep(pos, -1)}
              onLater={() => moveStep(pos, 1)}
            />
          }
        >
          {renderStep(e)}
        </CookStepItem>
      ))}
    </CookReorderList>
  );

  const byDish = (
    <CookDishColumns>
      {dishes.map((d, dish) => (
        <CookDishColumn key={d.id} heading={mark(dish, "md")}>
          {d.steps.length === 0 && (
            <li>
              <Text variant="small">No steps listed.</Text>
            </li>
          )}
          {d.steps.map((_, step) => {
            const e = { dish, step };
            const pos = order.findIndex((o) => o.dish === dish && o.step === step);
            return (
              <CookStepItem
                key={step}
                number={step + 1}
                current={pos === at}
                done={isDone(e)}
                tick={tick(e, () => tickAt(pos))}
                controls={<Text variant="small">#{pos + 1} overall</Text>}
              >
                {renderStep(e)}
              </CookStepItem>
            );
          })}
        </CookDishColumn>
      ))}
    </CookDishColumns>
  );

  return (
    <CookStage {...swipe}>
      <CookTopBar closeHref={finishHref} onClose={(e) => !running || window.confirm("A timer is still running. Leave cook mode?") || e.preventDefault()} title="Cooking together">
        {voice.supported && <CookVoiceToggle listening={voice.listening} onClick={voice.toggle} />}
      </CookTopBar>
      <CookDishLegend>
        {dishes.map((_, dish) => (
          <Fragment key={dish}>{mark(dish, "md")}</Fragment>
        ))}
      </CookDishLegend>
      <CookProgress count={total} current={at} done={doneAt} />
      <CookToolbar ref={toolbar}>
        <CookViewChoice label="View" options={VIEWS} value={view} onChange={setView} />
        <div className="flex flex-wrap items-center gap-x-2">
          {reordered && (
            <CookTextButton
              onClick={() => {
                apply(roundRobin);
                toolbar.current?.focus(); // the button goes away; keep focus inside the stage
              }}
            >
              Reset order
            </CookTextButton>
          )}
          {anyTicked && (
            <CookTextButton
              onClick={() => {
                clearAll();
                toolbar.current?.focus();
              }}
            >
              Clear ticks
            </CookTextButton>
          )}
          {wake.status}
        </div>
        {wake.note}
      </CookToolbar>
      <CookColumns
        rail={
          <CookDishTabs
            label="Ingredients by dish"
            idPrefix="cook-rail"
            tabs={dishes.map((d, dish) => ({ id: String(dish), label: d.title, mark: mark(dish, "sm") }))}
            value={String(railDish)}
            onChange={(v) => setRailDish(Number(v))}
          >
            <CookRail key={railDish} hiddenCount={railIngredients.length - lit.size} anyLit={lit.size > 0}>
              {railIngredients.length === 0 ? (
                <li>
                  <Text variant="small">No ingredients listed.</Text>
                </li>
              ) : (
                railOrder(railIngredients.length, lit).map(({ index: i, lit: on }) => {
                  const { quantity, rest } = splitIngredient(railIngredients[i]);
                  return (
                    <CookRailRow
                      key={i}
                      quantity={quantity ?? ""}
                      name={rest}
                      lit={on}
                      ticked={ticks[railDish]?.ingredients.has(i) ?? false}
                      onToggle={() => toggleIngredient(railDish, i)}
                    />
                  );
                })
              )}
            </CookRail>
          </CookDishTabs>
        }
        step={view === "one" ? oneStep : view === "all" ? allSteps : byDish}
        timers={<CookTimerRack timers={timers} now={now} onDismiss={dismiss} />}
      />
      <CookLive>{live.text}</CookLive>
      <CookFooter next={next ? `${nameOf(next.dish)}: ${textOf(next)}` : undefined} summary={view === "one" ? undefined : `${doneCount} of ${total} steps done`}>
        {view !== "one" ? (
          <CookPillLink href={finishHref}>Finish</CookPillLink>
        ) : (
          <>
            <CookPill variant="secondary" disabled={at === 0} onClick={() => go(-1)}>
              ← Back
            </CookPill>
            {next === undefined ? <CookPillLink href={finishHref}>Finish</CookPillLink> : <CookPill onClick={() => go(1)}>Next step →</CookPill>}
          </>
        )}
      </CookFooter>
    </CookStage>
  );
}
