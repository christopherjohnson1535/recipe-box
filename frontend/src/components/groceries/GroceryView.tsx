"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { GroceryRow, GrocerySection, ListBody, RecipeRow, RecipeShelf, RowMenu, ScaleStepper, type MenuEntry } from "@/components/ui/GroceryKit";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Toast, ToastDismiss, ToastRegion } from "@/components/ui/Toast";
import { TextLink } from "@/components/ui/TextLink";
import { splitIngredient } from "@/lib/scale";
import { amountsText, groupItems, SECTIONS, toBuy } from "./list-model";
import { scaleLabel, stepScale } from "./scale-steps";
import type { GroceryItem, GroceryRecipe } from "./types";
import { useGroceryList } from "./use-grocery-list";

const OFFLINE = "groceries-offline";

/** "Serves 4" for a bare number or range; a phrase ("makes about 4 bowls") as written. */
const servingsMeta = (servings: string | null) => {
  const s = servings?.trim();
  if (!s) return null;
  return splitIngredient(s).quantity === s ? `Serves ${s}` : s;
};

function LoadingList() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </>
  );
}

/** The shopping list at /groceries: recipes on it, then the items by store section. Everything is fetched in the browser so a kept copy of the page still opens offline. */
export function GroceryView() {
  const g = useGroceryList();
  const online = useOnline();
  const [showStaples, setShowStaples] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [text, setText] = useState("");
  const [typoed, setTypoed] = useState(false);
  const [adding, setAdding] = useState(false);
  const emptyButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  /** Where focus rests when a change takes the control it was on away (the items, or the page's own start of the list). */
  const listTop = useRef<HTMLDivElement>(null);
  const addField = useRef<HTMLInputElement>(null);
  /** The item whose tick should get focus back if a re-render (it moved to another place in the list) drops it. */
  const keepFocus = useRef<string | null>(null);

  const ticks = () => [...(root.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [])];
  /** Focus goes to the tick next to this one (or the start of the list when it was the last): call before taking the row away. */
  const focusBeside = (selector: string, id: string, attr: string) => {
    const all = [...(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])];
    const at = all.findIndex((el) => el.dataset[attr] === id);
    (all[at + 1] ?? all[at - 1] ?? listTop.current)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (wasConfirming.current && !confirmEmpty) (emptyButton.current ?? listTop.current)?.focus({ preventScroll: true }); // the button is gone once the list is empty
    wasConfirming.current = confirmEmpty;
  }, [confirmEmpty]);

  useEffect(() => {
    const id = keepFocus.current;
    if (!id || (document.activeElement && document.activeElement !== document.body)) return;
    const tick = ticks().find((el) => el.dataset.itemId === id);
    if (tick) {
      tick.focus();
      keepFocus.current = null;
    }
  });

  const { list } = g;
  const offlineAttrs = online ? {} : { "aria-describedby": OFFLINE };

  if (!list) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader kicker="Shopping list" title="Groceries" />
        {g.loadError ? (
          <div className="flex flex-col items-start gap-4">
            <Alert tone="error" title={online ? "Can’t load the list" : "You’re offline"}>
              {online ? "The server may be starting up. Wait a moment, then try again." : "This list isn’t saved on this device yet. Open it once with a connection and it stays readable here."}
            </Alert>
            <Button variant="secondary" onClick={() => void g.refresh()}>
              Try again
            </Button>
          </div>
        ) : (
          <LoadingList />
        )}
      </div>
    );
  }

  const staples = list.items.filter((i) => i.staple).length;
  const ticked = list.items.filter((i) => i.checked).length;
  const groups = groupItems(list.items, showStaples, g.holding);
  const left = toBuy(list);
  const description =
    list.items.length === 0
      ? "One list, shared by everyone in the household."
      : `${left === 0 ? "Nothing left to buy" : `${left} left to buy`}${ticked > 0 ? ` · ${ticked} ticked` : ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (adding) return; // a second tap or Enter while the first is on its way would add it twice
    const value = text.trim();
    if (!value) {
      setTypoed(true);
      return addField.current?.focus();
    }
    setTypoed(false);
    setAdding(true);
    const added = await g.addItem(value);
    setAdding(false);
    if (added) setText("");
    if (document.activeElement === document.body) addField.current?.focus(); // the Add button was disabled under focus
  }

  const menuFor = (item: GroceryItem): MenuEntry[] => [
    {
      kind: "group",
      label: "Move to",
      items: SECTIONS.map((s) => ({
        label: s.label,
        checked: s.id === item.section,
        onSelect: () => {
          if (s.id !== item.section) keepFocus.current = item.id; // the row reappears under another heading: follow it
          void g.move(item, s.id);
        },
      })),
    },
    { kind: "separator" },
    { kind: "item", item: { label: item.staple ? "Not a staple" : "Mark as staple", onSelect: () => void g.setStaple(item, !item.staple) } },
    {
      kind: "item",
      item: {
        label: "Remove",
        danger: true,
        onSelect: () => {
          focusBeside("[data-item-id]", item.id, "itemId");
          void g.removeItem(item);
        },
      },
    },
  ];

  const recipeRow = (r: GroceryRecipe) => {
    const down = stepScale(r.scale, -1);
    const up = stepScale(r.scale, 1);
    return (
      <RecipeRow
        key={r.recipeId}
        title={<TextLink href={`/recipes/${r.recipeId}`}>{r.title}</TextLink>}
        meta={servingsMeta(r.servings)}
        stepper={
          <ScaleStepper
            label={`Servings of ${r.title}`}
            valueLabel={scaleLabel(r.scale)}
            downLabel={`Fewer servings of ${r.title}`}
            upLabel={`More servings of ${r.title}`}
            downDisabled={down === null || !online}
            upDisabled={up === null || !online}
            onDown={() => down !== null && void g.setScale(r.recipeId, down)}
            onUp={() => up !== null && void g.setScale(r.recipeId, up)}
          />
        }
        remove={
          <IconButton
            icon="remove"
            quiet
            label={`Take ${r.title} off the list`}
            disabled={!online}
            data-recipe-id={r.recipeId}
            onClick={() => {
              focusBeside("[data-recipe-id]", r.recipeId, "recipeId");
              void g.removeRecipe(r.recipeId, r.title);
            }}
          />
        }
      />
    );
  };

  return (
    <div
      ref={root}
      className="flex flex-col gap-8"
      onPointerDown={() => (keepFocus.current = null)}
      onFocus={(e) => {
        if (e.target.dataset.itemId !== keepFocus.current) keepFocus.current = null;
      }}
    >
      <PageHeader kicker="Shopping list" title="Groceries" description={description} liveDescription />
      {/* The list keeps to the form measure on wide screens, so a row's tick and its options button stay within reach of each other. */}
      <div className="flex max-w-form flex-col gap-8">
        <OfflineNote id={OFFLINE}>You’re offline. This is the last copy of the list this device has. Ticking, adding and removing need the server; they work again once you have signal.</OfflineNote>
        <p role="status" className="sr-only">
          {g.announcement}
        </p>
        <ToastRegion>
          {g.problem && (
            <Toast role="alert" actions={<ToastDismiss onClick={g.dismissProblem} />}>
              That didn’t save. {g.problem}
            </Toast>
          )}
        </ToastRegion>

        {list.recipes.length > 0 && (
          <RecipeShelf defaultOpen={list.recipes.length <= 2} summary={`On this list · ${list.recipes.length} ${list.recipes.length === 1 ? "recipe" : "recipes"}`}>
            <ul>{list.recipes.map(recipeRow)}</ul>
          </RecipeShelf>
        )}

        <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-2 print:hidden">
          <Field label="Add an item" htmlFor="grocery-add" error={typoed ? "Type what to add, like “2 lb potatoes”." : undefined}>
            <div className="flex gap-3">
              <Input
                ref={addField}
                id="grocery-add"
                name="item"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={200}
                placeholder="Paper towels, 2 lb potatoes…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!online}
                readOnly={adding}
                aria-invalid={typoed || undefined}
                aria-describedby={typoed ? "grocery-add-msg" : online ? undefined : OFFLINE}
              />
              <Button type="submit" variant="secondary" pending={adding} disabled={!online} {...offlineAttrs}>
                Add
              </Button>
            </div>
          </Field>
        </form>

        <ListBody ref={listTop}>
          {list.items.length === 0 && list.recipes.length === 0 && (
            <EmptyState title="Nothing on the list yet" actions={<ButtonLink href="/">Choose recipes</ButtonLink>}>
              <p>Open a recipe and choose Add to groceries, or pick several on the home page. What you type above lands here too.</p>
            </EmptyState>
          )}

          {list.items.length === 0 && list.recipes.length > 0 && <Text variant="note">Nothing left to buy.</Text>}

          {groups.length === 0 && list.items.length > 0 && <Text variant="note">Everything left is a staple you always have. Show staples to see them.</Text>}

          {groups.length > 0 && (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <GrocerySection key={group.section} title={group.label} count={group.left === 0 ? "All ticked" : `${group.left} left`}>
                  {group.items.map((item) => (
                    <GroceryRow
                      key={item.id}
                      itemId={item.id}
                      amounts={amountsText(item.amounts)}
                      name={item.name}
                      note={item.staple ? "Staple" : undefined}
                      checked={item.checked}
                      onToggle={() => {
                        keepFocus.current = item.id; // the row moves when it sinks; a keyboard user stays on it
                        void g.toggle(item);
                      }}
                      disabled={!online}
                      menu={<RowMenu label={`Options for ${item.name}`} entries={menuFor(item)} disabled={!online} />}
                    />
                  ))}
                </GrocerySection>
              ))}
            </div>
          )}
        </ListBody>

        {(list.items.length > 0 || list.recipes.length > 0) && (
          <div className="grid grid-cols-2 items-center gap-x-6 gap-y-2 border-t border-(--rule-hair) pt-4 sm:flex sm:flex-wrap sm:justify-end">
            {staples > 0 && (
              <Button variant="ghost" className="justify-self-start sm:mr-auto" onClick={() => setShowStaples((s) => !s)}>
                {showStaples ? `Hide staples (${staples})` : `Show staples (${staples})`}
              </Button>
            )}
            {list.items.length > 0 && (
              <Button
                variant="secondary"
                className="max-sm:order-first max-sm:col-span-2 max-sm:w-full"
                disabled={ticked === 0 || !online}
                {...offlineAttrs}
                onClick={() => {
                  listTop.current?.focus({ preventScroll: true }); // this button is about to disable itself
                  void g.clearChecked(ticked);
                }}
              >
                Clear ticked{ticked > 0 ? ` (${ticked})` : ""}
              </Button>
            )}
            <Button variant="ghost" className="col-start-2 justify-self-end sm:col-start-auto" ref={emptyButton} disabled={!online || confirmEmpty} {...offlineAttrs} onClick={() => setConfirmEmpty(true)}>
              Empty list
            </Button>
          </div>
        )}
        {confirmEmpty && (
          <ConfirmInline
            confirmLabel="Empty list"
            cancelLabel="Keep list"
            pending={g.busy}
            onCancel={() => setConfirmEmpty(false)}
            onConfirm={async () => {
              await g.empty();
              setConfirmEmpty(false);
            }}
          >
            Empty the whole list? Every recipe and every item comes off it, for everyone in the household. Staples and your section choices are kept.
          </ConfirmInline>
        )}
      </div>
    </div>
  );
}
