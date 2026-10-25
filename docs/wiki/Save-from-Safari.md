# Save from Safari

Send the recipe you are looking at to Recipe Box in one tap: from the **Share** menu on an iPad or iPhone (an Apple Shortcut), or from a **bookmark** on a computer (a bookmarklet). iOS has no way for a web app to appear in the Share menu, which is why the Shortcut exists.

Both do the same thing: open `https://<your-address>/import?url=<the page address>` in your browser. Recipe Box then shows **Import this page?** with the address. Nothing is fetched until you press **Import this recipe**, and nothing is saved until you have checked the draft ([[Importing Recipes]]).

The exact address and a ready-to-drag bookmark are on **Settings → Save from Safari** inside the app, filled in for your server.

## Apple Shortcut (iPad and iPhone)

You build it once; it takes about two minutes. Shortcuts cannot be exported from here, so the steps are written out. Action names can differ a little between iPadOS versions; use the search box in the action list.

1. Open **Shortcuts**, tap **+**, and name the shortcut **Save to Recipe Box**.
2. Tap the **i** (details) button. Turn on **Show in Share Sheet**. Under **Share Sheet Types** leave only **URLs** and **Safari web pages** ticked.
3. Add the action **URL Encode** (search "encode"). Set it to **Encode** and tap its input to choose **Shortcut Input**.
4. Add a **Text** action. Type your Recipe Box address followed by `/import?url=` and nothing after it, for example `https://recipes.example.ts.net/import?url=`. Then tap after the `=` and insert the variable **URL Encoded Text** (tap the variable bar above the keyboard, choose the output of step 3).
5. Add **Open URLs** and set its input to the **Text** from step 4.
6. Tap **Done**.

To use it: in Safari on a recipe page tap **Share** (the square with the arrow), scroll the action list and tap **Save to Recipe Box**. If it is not in the list, tap **Edit Actions** at the bottom of the share sheet and add it (and star it to keep it near the top).

Notes:
- The step that encodes the address matters. A recipe link often contains `?` and `&`; unencoded, everything after the first `&` would be lost.
- The Shortcut opens Recipe Box in **Safari**, not in the Home Screen app (iOS opens links in the browser). Safari keeps its own sign-in, so the first time you will be asked to sign in; after signing in you land on the confirm screen for the page you shared.
- The address in step 4 must be the one you use in Safari, over HTTPS ([[Deploying]]).

### Checking the address without the Shortcut
Paste this into Safari's address bar (changing the first part to your address) and you should see **Import this page?** with the recipe address underneath:

```
https://<your-address>/import?url=https%3A%2F%2Fexample.com%2Fpancakes
```

If that works, the Shortcut will: it opens exactly this form of address.

## Bookmarklet (computer)

1. Open **Settings → Save from Safari** in Recipe Box.
2. Show your bookmarks bar (Chrome and Edge: `Ctrl`+`Shift`+`B`; Safari on a Mac: View → Show Favorites Bar; Firefox: `Ctrl`+`Shift`+`B`).
3. Drag the **Save to Recipe Box** tab onto the bar.
4. On any recipe page, click the bookmark. Recipe Box opens in a new tab and asks you to confirm.

If you cannot drag it, open the **Can't drag it?** note on that page, copy the bookmark, create any bookmark, then paste the copied text into its address box and name it.

What it does: it reads only the address of the page you are on (`location.href`) and opens Recipe Box with it. It does not read the page, its text, its title or its cookies. Some sites block bookmarklets with a strict content policy; if clicking does nothing there, copy the page address and use Import → Link instead.

## Safety
- Opening a link such as `/import?url=…` never imports by itself, so a link on another website cannot make your Recipe Box fetch a page. You must be signed in and press **Import this recipe**.
- Only `http://` and `https://` addresses are accepted, up to 2,048 characters, without a user name or password. Anything else shows "That link can't be imported" and nothing is requested.
- The server fetches the page with the same public-addresses-only protection as any other link import (private and internal addresses are refused).

## Not working?
| Symptom | Fix |
|---|---|
| Shortcut is not in the share sheet | Step 2: **Show in Share Sheet** on, types include URLs. Add it under **Edit Actions**. |
| Recipe Box opens but the link is cut short | The encode step (3) is missing, or step 4 does not use its output. |
| "Sign in" screen every time | Safari and the Home Screen app keep separate sign-ins. Sign in once in Safari. |
| Bookmark does nothing | The site blocks bookmarklets, or a pop-up blocker stopped the new tab; allow pop-ups for that site once. |
| "That link can't be imported" | The shared item was not a web page address (for example a photo). Share the page itself. |
| "This site blocks automated requests" | Not a Shortcut problem: use **Paste text** ([[Importing Recipes]]). |

_Status: Phase 4._
