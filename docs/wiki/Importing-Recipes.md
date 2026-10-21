# Importing recipes

Every import gives you a **draft** to check and fix before it is saved.

| From | How | Notes |
|---|---|---|
| A web link | Import → Link → paste the URL | Works best on sites that publish recipe data (most big recipe sites). The main photo is downloaded so it survives the site changing. |
| A blocked site | Import → Text → paste the recipe | Some sites block servers; copy the recipe text from the page instead. Needs AI. |
| A photo | Import → Photo → pick or take up to 6 photos | Cookbook pages, handwritten cards, screenshots. Needs AI; without it the photo is saved next to an empty form. |
| A photo of a dish | Import → Photo → "Guess from a dish" | Clearly marked as a guess. Needs AI. |
| Safari share sheet | Apple Shortcut / bookmarklet | Planned (Phase 4). |

**If a link import fails**
- *"We couldn't find a recipe on that page"*: the page has no machine-readable recipe. Paste the recipe text instead.
- *"That site does not let us read its pages"*: the site blocks servers (login wall, bot check). Paste the text instead.
- *"That address is not allowed"*: only public web addresses (http or https) can be imported, never ones inside your home network.
- If the recipe's photo cannot be downloaded you still get the draft, with a note; add a photo yourself. The same goes for photos that are too big (over 10,000 px a side or 40 megapixels).
- Very long lists or text on a page are cut short (500 items, 10,000 characters per field) and the draft says so; cooking times over a week are left blank.
- Pages that take too long to read, or are built in an unreadable way, are treated as failed or recipe-less; use "paste the recipe text" instead.

Already saved that link? You'll get a link to the existing recipe instead of a duplicate.

Imported recipes keep the source link and author credit. Recipes are for private household use.

_Status: link import is Phase 1, photo/text import Phase 2 — see [[Roadmap]]._
