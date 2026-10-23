"use client";

import { useEffect, useState } from "react";
import { OPENER_ACTIONS_ID } from "@/components/ui/SpreadOpener";
import { FloatingBar } from "@/components/ui/FloatingBar";
import { useRecipeState } from "./RecipeState";

/** The floating bar: how many ingredients are ticked, and the way into cooking mode. */
export function RecipeBar({ id, total }: { id: string; total: number }) {
  const { ticked } = useRecipeState();
  // Hidden on the server and first render; shown once the opener's actions are out of view (or without IntersectionObserver).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const target = document.getElementById(OPENER_ACTIONS_ID);
    if (!target || typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver((entries) => setShown(!entries[entries.length - 1].isIntersecting));
    io.observe(target);
    return () => io.disconnect();
  }, []);
  const n = [...ticked].filter((i) => i < total).length;
  const status = n === 0 ? "Ready when you are" : `${n} ${n === 1 ? "ingredient" : "ingredients"} checked`;
  return <FloatingBar status={status} shortStatus={`${n} checked`} href={`/recipes/${id}/cook`} action="Start cooking" shown={shown} />;
}
