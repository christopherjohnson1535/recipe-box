"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useOnline } from "@/components/offline/use-online";
import { FavouriteToggle, TileStar } from "@/components/ui/FavouriteKit";
import { ApiError, api as browserApi } from "@/lib/api";
import { rekeep } from "./keep-favourites";

type Api = Pick<typeof browserApi, "addFavourite" | "removeFavourite">;

type Props = {
  recipeId: string;
  title: string;
  /** As the server read it for this member. */
  initial: boolean;
  /** `tile`: the icon on a home card; `page`: "Favourite" beside the recipe page's actions; `featured`: the same beside
   * the home page's featured recipe, named with the recipe ("Favourite: Short Ribs") like the tiles around it. */
  variant: "tile" | "page" | "featured";
  api?: Api;
};

/**
 * The reader's own star on a recipe (REC-5). It turns at once and the request follows; if the request fails the star
 * turns back and a short reason is read out. A recipe deleted elsewhere (404) refreshes the page. Starring needs the
 * server: offline the star is off, with the reason tied to it, and nothing is queued to send later (KIT-5). After a
 * change the device's offline copy of the page is kept or fetched again, so it shows the star as it is now.
 */
export function FavouriteStar({ recipeId, title, initial, variant, api = browserApi }: Props) {
  const router = useRouter();
  const online = useOnline();
  const [on, setOn] = useState(initial);
  const [pop, setPop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const offlineId = useId();

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setPop(next);
    setBusy(true);
    setStatus("");
    try {
      await (next ? api.addFavourite(recipeId) : api.removeFavourite(recipeId));
      setStatus(next ? `Added “${title}” to your favourites.` : `Removed “${title}” from your favourites.`);
      // No refresh: in the favourites list an unstarred card stays (with an empty star, so it can be starred again and
      // focus is not lost) until the list is next loaded.
      void rekeep(recipeId, next);
    } catch (e) {
      setOn(!next);
      setPop(false);
      if (e instanceof ApiError && e.status === 404) {
        setStatus(`“${title}” was deleted.`);
        router.refresh();
      } else {
        setStatus(next ? "Couldn’t add it to your favourites. Try again." : "Couldn’t remove it from your favourites. Try again.");
      }
    }
    setBusy(false);
  }

  // While a request runs the star is only aria-disabled: a disabled button would drop keyboard focus.
  const shared = {
    on,
    pop,
    disabled: !online,
    "aria-disabled": busy || undefined,
    "aria-describedby": online ? undefined : offlineId,
    onClick: () => void toggle(),
  };

  return (
    <>
      {variant === "tile" ? (
        <TileStar {...shared} aria-label={`Favourite: ${title}`} />
      ) : (
        <FavouriteToggle {...shared} aria-label={variant === "featured" ? `Favourite: ${title}` : undefined} />
      )}
      {/* The reason is read with the star, not shown: the offline banner already says it, the star is dimmed, and a
          visible line here would split the opener's actions (Delete keeps its own visible note). */}
      {!online && (
        <span id={offlineId} className="sr-only">
          You’re offline. Starring needs the server.
        </span>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </>
  );
}
