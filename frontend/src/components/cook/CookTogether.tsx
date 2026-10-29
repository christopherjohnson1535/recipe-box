"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  CookColumns, CookDishColumn, CookDishColumns, CookDishLegend, CookDishMark, CookDishTabs, CookFooter, CookLive, CookMoveButtons, CookNudge,
  CookPill, CookPillLink, CookProgress, CookRail, CookRailRow, CookReorderList, CookStage, CookStepItem, CookStepText, CookTextButton, CookTick,
  CookSoundToggle, CookToolbar, CookTopBar, CookViewChoice, CookVoiceToggle,
} from "@/components/ui/CookKit";
import { useOnline } from "@/components/offline/use-online";
import { ArrowButton, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { splitIngredient } from "@/lib/scale";
import { timerLabel } from "@/lib/timers";
import { clampStep, litIngredients, railOrder } from "./cook-logic";
import { CookPlanner } from "./CookPlanner";
import { planOrder } from "./cook-plan-logic";
import { renderCookStep } from "./cook-step";
import { bringNext, canMove, dishInitials, dishNames, firstOpen, interleave, move, nextOfDish, ordinal, type DishStep } from "./cook-together-logic";
import { readCookTicks, readCookTogetherOrder, useCookTogetherOrder, useCookTogetherView, useDishTicks, type CookTogetherView } from "./cook-store";
import { useCookWake } from "./CookWake";
import { useAnnounce, useStepKeys, useSwipe } from "./use-cook-controls";
import { CookTimerRack } from "./timers/CookTimerRack";
import { useCookTimers } from "./timers/use-cook-timers";
import { useCookPlan } from "./use-cook-plan";
import { useVoice } from "./use-voice";

export type Dish = { id: string; title: string; ingredients: string[]; steps: string[] };

const VIEWS: { id: CookTogetherView; label: string }[] = [
  { id: "one", label: "One step" },
  { id: "all", label: "All steps" },
  { id: "dishes", label: "By dish" },
];

const sameStep = (a: DishStep, b: DishStep) => a.dish === b.dish && a.step === b.step;

/**
 * Cook two to four recipes at once. One combined order of steps (round-robin to begin with; the cook can move steps and pull a
 * dish's next step forward), shown one step at a time, as one list, or in a column per dish. Order, step index and timers live
 * here, above the views, so timers keep running when the step or the view changes. Ticks are each recipe's own (cook-store.ts),
 * so they are shared with single-recipe cook mode. The current step is a (dish, step), not a position, so it stays the same
 * step when the order changes under it (a move here, another tab's move, an expired order). Render it with a `key` of the
 * dishes' ids: two sessions are two components.
 *
 * With `planning` (the server has an AI provider), "Plan the evening" asks for a suggested order (#83). It opens as a preview in
 * the step area; "Use this order" replaces the order (still movable step by step, and "Reset order" still goes back to taking
 * turns), "Keep my order" closes it. Offline the action stays, disabled, with the reason beside it.
 */
export function CookTogether({ dishes, planning = false }: { dishes: Dish[]; planning?: boolean }) {
  const ids = dishes.map((d) => d.id);
  const stepCounts = dishes.map((d) => d.steps.length);
  const marks = dishInitials(dishes.map((d) => d.title));
  const names = dishNames(dishes.map((d) => d.title));
  const [cursor, setCursor] = useState<DishStep | null>(null);
  const [live, announce] = useAnnounce();
  const { timers, now, running, start, dismiss, pause, resume, addMinute, alert } = useCookTimers(announce);
  const [view, setView] = useCookTogetherView();
  const { order, setOrder, reset } = useCookTogetherOrder(ids, stepCounts);
  const { ticks, toggleIngredient, toggleStep, clearAll } = useDishTicks(
    dishes.map((d) => ({ id: d.id, ingredientCount: d.ingredients.length, stepCount: d.steps.length })),
  );
  const wake = useCookWake();
  const toolbar = useRef<HTMLDivElement>(null);
  const online = useOnline();
  const planner = useCookPlan(ids);
  const [serveAt, setServeAt] = useState("");
  const planOpen = planner.state.status !== "closed";
  const planAction = useRef<HTMLButtonElement>(null);

  // Once, after mount: open on the first step of the order not yet done (a reloaded Home Screen app picks up where the cook was).
  // Reads the store directly, so a later tick or another tab's write never moves the step.
  useEffect(() => {
    const done = dishes.map((d) => readCookTicks(d.id, d.ingredients.length, d.steps.length).steps);
    const stored = readCookTogetherOrder(ids, stepCounts);
    const first = firstOpen(stored, done);
    // Not a lazy useState initial: the server cannot read the store, and the first client render must match its HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first > 0) setCursor(stored[first]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
  }, []);

  const total = order.length;
  // Where the current step is now; when it is gone (a recipe was edited) the first step not done.
  const found = cursor ? order.findIndex((e) => sameStep(e, cursor)) : -1;
  const open = cursor && found < 0 ? firstOpen(order, ticks.map((t) => t.steps)) : 0;
  const at = clampStep(found >= 0 ? found : open, total);
  const here = order[at] as DishStep | undefined;
  const isDone = (e: DishStep) => ticks[e.dish]?.steps.has(e.step) ?? false;
  const textOf = (e: DishStep) => dishes[e.dish].steps[e.step];
  const nameOf = (dish: number) => names[dish];
  const describe = (e: DishStep) => `${nameOf(e.dish)}, step ${e.step + 1} of ${dishes[e.dish].steps.length}: ${textOf(e)}`;
  const mark = (dish: number, size: "sm" | "md", wrap = false) => <CookDishMark dish={dish} initial={marks[dish]} name={nameOf(dish)} size={size} wrap={wrap} />;

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
      if (view !== "one" || planOpen) return; // arrows, swipes and voice move through the one-step view only, not under the plan
      const to = clampStep(at + by, total);
      if (to === at) return;
      setCursor(order[to]);
      announce(describe(order[to]));
    },
    // describe only reads props
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, planOpen, at, total, order, announce],
  );
  useStepKeys(go);
  const swipe = useSwipe(go);
  const voice = useVoice((c) => {
    if (c === "repeat") announce(here ? describe(here) : "");
    else go(c === "next" ? 1 : -1);
  });

  const moveStep = (pos: number, dir: -1 | 1) => {
    const next = move(order, pos, dir);
    if (next === order) return;
    const e = order[pos];
    const way = dir < 0 ? "earlier" : "later";
    setOrder(next);
    announce(`Moved ${nameOf(e.dish)} step ${e.step + 1} ${way}. It’s now ${ordinal(pos + dir + 1)} of ${total}.`);
  };
  // A move button that cannot move keeps focus and a tap does nothing: say why, since it is silent otherwise.
  const explainBlocked = (e: MouseEvent<HTMLElement>, pos: number) => {
    const button = (e.target as Element).closest("button");
    if (button?.getAttribute("aria-disabled") !== "true") return;
    const dir = button.getAttribute("aria-label")?.endsWith("earlier") ? -1 : 1;
    const way = dir < 0 ? "earlier" : "later";
    const mine = order[pos];
    const other = order[pos + dir];
    announce(
      other
        ? `Can’t move ${way}: ${nameOf(other.dish)}’s step ${other.step + 1} comes ${dir < 0 ? "first" : "next"}`
        : `Can’t move ${way}: ${nameOf(mine.dish)} step ${mine.step + 1} is already ${dir < 0 ? "first" : "last"}`,
    );
  };
  const bring = (dish: number) => {
    const from = nextOfDish(order, at, dish);
    if (from === -1) return;
    const next = bringNext(order, at, dish);
    if (next !== order) setOrder(next);
    announce(`${nameOf(dish)} step ${order[from].step + 1} is next`);
  };
  // Ticking the current step makes the next one current (as in cook mode); any other step leaves the list where it is.
  const tickAt = (pos: number) => {
    const e = order[pos];
    if (pos === at && !isDone(e)) setCursor(order[clampStep(pos + 1, total)]);
    toggleStep(e.dish, e.step);
  };

  const renderStep = (e: DishStep) =>
    renderCookStep(textOf(e), dishes[e.dish].ingredients, `${e.dish}:${e.step}`, {
      timers,
      now,
      start: (key, text, seconds, nth) => start(key, timerLabel(e.step + 1, text, seconds, nameOf(e.dish), nth), seconds),
    });
  const tick = (e: DishStep, onClick: () => void) => (
    <CookTick pressed={isDone(e)} aria-label={`${nameOf(e.dish)} step ${e.step + 1} done`} onClick={onClick}>
      Done
    </CookTick>
  );

  // Finishing (or closing) after several dishes goes to the recipes, not to one of them.
  const finishHref = "/";
  if (total === 0) {
    return (
      <CookStage>
        <EmptyState
          title="These recipes have no steps yet"
          level={1}
          actions={dishes.map((d, dish) => (
            <ButtonLink key={d.id} href={`/recipes/${d.id}/edit`}>
              Edit {nameOf(dish)}
            </ButtonLink>
          ))}
        >
          Add the method and cook mode will walk you through it.
        </EmptyState>
        <ButtonLink href={finishHref} variant="secondary" className="mt-6 self-start">
          Back to recipes
        </ButtonLink>
      </CookStage>
    );
  }

  const doneCount = order.filter(isDone).length;
  const doneAt = new Set(order.flatMap((e, pos) => (isDone(e) ? [pos] : [])));
  const anyTicked = ticks.some((t) => t.ingredients.size > 0 || t.steps.size > 0);
  const roundRobin = interleave(stepCounts);
  const reordered = order.some((e, pos) => e.dish !== roundRobin[pos].dish || e.step !== roundRobin[pos].step);

  // The suggested order, when it fits these dishes as they are now (a recipe edited since the page opened does not).
  const suggested = planner.state.status === "ready" ? planOrder(planner.state.plan, ids, stepCounts) : null;
  const planState =
    planner.state.status === "ready" && !suggested
      ? { status: "error" as const, message: "These recipes changed since this page opened. Close cooking mode and open it again to plan." }
      : planner.state;
  const closePlan = (why: string) => {
    planner.close();
    announce(why);
    // The panel goes away; focus goes back to the action that opened it (or the toolbar while it is disabled).
    requestAnimationFrame(() => (planAction.current && !planAction.current.disabled ? planAction.current : toolbar.current)?.focus());
  };
  const acceptPlan = () => {
    if (!suggested) return;
    setOrder(suggested);
    const first = suggested[firstOpen(suggested, ticks.map((t) => t.steps))];
    setCursor(first);
    closePlan(`Using the suggested order. ${describe(first)}`);
  };

  const current = order[at];
  const next = order[at + 1];
  const railIngredients = dishes[railDish].ingredients;
  const onCurrentDish = railDish === current.dish;
  const lit = onCurrentDish ? litIngredients(textOf(current), railIngredients) : new Set<number>();
  // The nudge pulls a dish's next step to right after this one: nothing to offer when it is already there.
  const nudges = dishes.flatMap((_, dish) => (dish !== current.dish && nextOfDish(order, at, dish) > at + 1 ? [dish] : []));

  const oneStep = (
    <>
      <CookStepText
        dish={mark(current.dish, "md", true)}
        label={`Step ${current.step + 1} of ${dishes[current.dish].steps.length} · ${ordinal(at + 1)} of ${total}`}
        action={tick(current, () => toggleStep(current.dish, current.step))}
      >
        {renderStep(current)}
      </CookStepText>
      {nudges.length > 0 && (
        <div className="mt-6 flex flex-col items-start gap-1">
          {nudges.map((dish) => (
            <CookNudge key={dish} mark={mark(dish, "sm")} onClick={() => bring(dish)}>
              Bring {nameOf(dish)}’s next step here
            </CookNudge>
          ))}
        </div>
      )}
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
            // Delegated: the kit's buttons ignore a press they cannot act on, and this says why.
            <div onClick={(ev) => explainBlocked(ev, pos)}>
              <CookMoveButtons
                stepLabel={`${nameOf(e.dish)} step ${e.step + 1}`}
                canEarlier={canMove(order, pos, -1)}
                canLater={canMove(order, pos, 1)}
                onEarlier={() => moveStep(pos, -1)}
                onLater={() => moveStep(pos, 1)}
              />
            </div>
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
                controls={
                  <Text variant="small">
                    {ordinal(pos + 1)} of {total}
                  </Text>
                }
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
        {planning && (
          <ArrowButton
            ref={planAction}
            disabled={!online || planOpen}
            aria-describedby={online ? undefined : "cook-plan-offline"}
            aria-expanded={planOpen}
            aria-controls={planOpen ? "cook-plan" : undefined}
            onClick={planner.request}
          >
            Plan the evening
          </ArrowButton>
        )}
        <div className="flex flex-wrap items-center gap-x-2">
          {reordered && (
            <CookTextButton
              onClick={() => {
                reset();
                announce("Order reset");
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
          {alert.supported && <CookSoundToggle muted={alert.muted} onChange={alert.setMuted} />}
          {wake.status}
        </div>
        {wake.note}
        {planning && !online && (
          <div className="order-last w-full">
            <Text variant="small" id="cook-plan-offline">
              You’re offline. Planning the evening needs the server; your order and ticks still work.
            </Text>
          </div>
        )}
      </CookToolbar>
      <CookColumns
        wide={view === "dishes"}
        rail={
          <CookDishTabs
            label="Ingredients by dish"
            idPrefix="cook-rail"
            tabs={dishes.map((_, dish) => ({
              id: String(dish),
              label: nameOf(dish),
              mark: mark(dish, "sm"),
            }))}
            value={String(railDish)}
            onChange={(v) => setRailDish(Number(v))}
          >
            <CookRail key={railDish} heading={onCurrentDish ? "For this step" : "All ingredients"} hiddenCount={railIngredients.length - lit.size} anyLit={lit.size > 0}>
              {railIngredients.length === 0 ? (
                <li>
                  <Text variant="small">No ingredients listed.</Text>
                </li>
              ) : (
                railOrder(railIngredients.length, lit).map(({ index: i, lit: on }) => {
                  const { quantity, rest } = splitIngredient(railIngredients[i]);
                  return <CookRailRow key={i} quantity={quantity ?? ""} name={rest} lit={on} ticked={ticks[railDish]?.ingredients.has(i) ?? false} onToggle={() => toggleIngredient(railDish, i)} />;
                })
              )}
            </CookRail>
          </CookDishTabs>
        }
        step={
          planState.status !== "closed" ? (
            <div id="cook-plan">
              <CookPlanner
                state={planState}
                ids={ids}
                names={names}
                mark={(dish) => mark(dish, "md")}
                stepText={(dish, step) => dishes[dish].steps[step]}
                onRetry={planner.request}
                serveAt={serveAt}
                onServeAt={setServeAt}
              />
            </div>
          ) : view === "one" ? (
            oneStep
          ) : view === "all" ? (
            allSteps
          ) : (
            byDish
          )
        }
        timers={<CookTimerRack timers={timers} now={now} onDismiss={dismiss} onPause={pause} onResume={resume} onAddMinute={addMinute} />}
      />
      <CookLive>{live.text}</CookLive>
      <CookFooter
        next={next ? `${nameOf(next.dish)}: ${textOf(next)}` : undefined}
        summary={planOpen ? "Your order stays until you choose this one." : view === "one" ? undefined : `${doneCount} of ${total} steps done`}
      >
        {planOpen ? (
          <>
            <CookPill variant="secondary" short="Keep mine" onClick={() => closePlan("Kept your order")}>
              Keep my order
            </CookPill>
            {suggested && (
              <CookPill short="Use this" onClick={acceptPlan}>
                Use this order
              </CookPill>
            )}
          </>
        ) : view !== "one" ? (
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
