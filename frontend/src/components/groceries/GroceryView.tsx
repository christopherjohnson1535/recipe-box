"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { GroceryRow, GrocerySection, RecipeRow, RecipeShelf, RowMenu, ScaleStepper, type MenuEntry } from "@/components/ui/GroceryKit";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
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
  const emptyButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (wasConfirming.current && !confirmEmpty) emptyButton.current?.focus();
    wasConfirming.current = confirmEmpty;
  }, [confirmEmpty]);

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
      : `${left === 0 ? "Nothing left to buy" : `${left} left to buy`}${ticked > 0 ? ` · ${ticked} crossed off` : ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return setTypoed(true);
    setTypoed(false);
    if (await g.addItem(value)) setText("");
  }

  const menuFor = (item: GroceryItem): MenuEntry[] => [
    { kind: "group", label: "Move to", items: SECTIONS.map((s) => ({ label: s.label, checked: s.id === item.section, onSelect: () => void g.move(item, s.id) })) },
    { kind: "separator" },
    { kind: "item", item: { label: item.staple ? "Not a staple" : "Mark as staple", onSelect: () => void g.setStaple(item, !item.staple) } },
    { kind: "item", item: { label: "Remove", danger: true, onSelect: () => void g.removeItem(item) } },
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
            downDisabled={down === null || !online || g.busy}
            upDisabled={up === null || !online || g.busy}
            onDown={() => down !== null && void g.setScale(r.recipeId, down)}
            onUp={() => up !== null && void g.setScale(r.recipeId, up)}
          />
        }
        remove={<IconButton icon="remove" quiet label={`Take ${r.title} off the list`} disabled={!online} onClick={() => void g.removeRecipe(r.recipeId, r.title)} />}
      />
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader kicker="Shopping list" title="Groceries" description={description} liveDescription />
      <OfflineNote id={OFFLINE}>You’re offline. This is the last copy of the list this device has. Ticking, adding and removing need the server; they work again once you have signal.</OfflineNote>
      <p role="status" className="sr-only">
        {g.announcement}
      </p>
      {g.problem && (
        <Alert tone="error" title="That didn’t save">
          {g.problem}
        </Alert>
      )}

      {list.recipes.length > 0 && (
        <RecipeShelf summary={`On this list · ${list.recipes.length} ${list.recipes.length === 1 ? "recipe" : "recipes"}`}>
          <ul>{list.recipes.map(recipeRow)}</ul>
        </RecipeShelf>
      )}

      <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-2">
        <Field label="Add an item" htmlFor="grocery-add" error={typoed ? "Type what to add, like “2 lb potatoes”." : undefined}>
          <div className="flex gap-3">
            <Input
              id="grocery-add"
              name="item"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={200}
              placeholder="Paper towels, 2 lb potatoes…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!online}
              aria-invalid={typoed || undefined}
              aria-describedby={typoed ? "grocery-add-msg" : online ? undefined : OFFLINE}
            />
            <Button type="submit" variant="secondary" disabled={!online} {...offlineAttrs}>
              Add
            </Button>
          </div>
        </Field>
      </form>

      {list.items.length === 0 && list.recipes.length === 0 && (
        <EmptyState
          title="Nothing on the list yet"
          actions={<ButtonLink href="/">Choose recipes</ButtonLink>}
        >
          <p>Open a recipe and choose Add to groceries, or pick several on the home page. What you type above lands here too.</p>
        </EmptyState>
      )}

      {groups.length === 0 && list.items.length > 0 && <Text variant="note">Everything left is a staple you always have. Show staples to see them.</Text>}

      {groups.length > 0 && (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <GrocerySection key={group.section} title={group.label} count={group.left === 0 ? "All crossed off" : `${group.left} left`}>
              {group.items.map((item) => (
                <GroceryRow
                  key={item.id}
                  amounts={amountsText(item.amounts)}
                  name={item.name}
                  note={item.staple ? "Staple" : undefined}
                  checked={item.checked}
                  onToggle={() => void g.toggle(item)}
                  disabled={!online}
                  menu={<RowMenu label={`Options for ${item.name}`} entries={menuFor(item)} disabled={!online} />}
                />
              ))}
            </GrocerySection>
          ))}
        </div>
      )}

      {(list.items.length > 0 || list.recipes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {staples > 0 && (
            <Button variant="ghost" onClick={() => setShowStaples((s) => !s)}>
              {showStaples ? `Hide staples (${staples})` : `Show staples (${staples})`}
            </Button>
          )}
          {list.items.length > 0 && (
            <Button variant="secondary" disabled={ticked === 0 || !online} {...offlineAttrs} onClick={() => void g.clearChecked(ticked)}>
              Clear ticked{ticked > 0 ? ` (${ticked})` : ""}
            </Button>
          )}
          <Button variant="ghost" ref={emptyButton} disabled={!online || confirmEmpty} {...offlineAttrs} onClick={() => setConfirmEmpty(true)}>
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
  );
}
