import { KEEP_MARKER } from "./rules";

const [, name] = /name="([^"]+)"/.exec(KEEP_MARKER)!;

/**
 * Marks a page as a good copy to keep for offline reading. Render it only where the recipe itself rendered, so the
 * worker never keeps "can't reach the server" in place of the recipe. React hoists the tag into <head>.
 */
export function KeepOffline() {
  return <meta name={name} content="1" />;
}
