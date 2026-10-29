import { FAVOURITE_MARKER, KEEP_MARKER } from "./rules";

const nameIn = (marker: string) => /name="([^"]+)"/.exec(marker)![1];
const name = nameIn(KEEP_MARKER);
const favourite = nameIn(FAVOURITE_MARKER);

/**
 * Marks a page as a good copy to keep for offline reading. Render it only where the recipe itself rendered, so the
 * worker never keeps "can't reach the server" in place of the recipe. `isFavourite` adds a second mark, so the offline
 * page can list the reader's favourites first. React hoists the tags into <head>.
 */
export function KeepOffline({ isFavourite = false }: { isFavourite?: boolean }) {
  return (
    <>
      <meta name={name} content="1" />
      {isFavourite && <meta name={favourite} content="1" />}
    </>
  );
}
