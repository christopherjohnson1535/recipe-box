# Importing recipes

Every import gives you a **draft** to check and fix before it is saved. Open **Import** and pick Link, Photo or Text; the page address remembers the choice, and `/import?url=…` starts a link import straight away.

| From | How | Notes |
|---|---|---|
| A web link | Import → Link → paste the URL | Works best on sites that publish recipe data (most big recipe sites). If a page has none and AI is on, the AI reads the page text instead and the draft says so; check it against the page. The main photo is downloaded so it survives the site changing. |
| A blocked site, or any text | Import → Text → paste the recipe | Some sites block servers; copy the recipe text from the page instead. Headings such as "For the sauce" become sections. Needs AI. You can add the page address so the recipe keeps its source. |
| A photo | Import → Photo → pick or take up to 6 photos | Cookbook pages, handwritten cards, screenshots. Needs AI; without it the photo is saved next to an empty form. |
| A photo of a dish | Import → Photo → "Guess from a dish" | Clearly marked as a guess. Needs AI. |
| Safari share sheet | Apple Shortcut / bookmarklet | Planned (Phase 4). |

**While it works**
- A link takes a few seconds; reading photos can take about 20 seconds. **Stop waiting and edit** brings the form back (the server may still finish, its answer is ignored). If an import fails you always get a next step: Try again, Type it in, or Sign in.
- When the draft arrives you land on **Check the recipe**. Leaving without saving asks first.
- The original photos stay with the form while you check or type (beside it on wide screens, a scrollable strip above it on phones and iPad portrait).

- The import page has three tabs: **Photo**, **Link** and **Paste text**. While a photo is read you see it tilted on a dark background with a scan line sweeping over it; a link shows the site's name instead. Then the recipe fills in beside it: the title types in and the ingredients slide in one by one.
- Anything the reader was unsure of is marked with a **?** on a mustard-tinted row, and warnings (such as a smudged oven temperature) appear in a note with a mustard rule. Check those before you save. If your device is set to reduce motion, nothing sweeps, types or slides.

**If AI is switched off**
- Photo: the photos are kept and shown next to an empty recipe, so you can type it in.
- Text: this needs AI, so the page says so and links to the plain recipe form.
- Links still work for sites that publish recipe data.

**On the iPad**: *Take or choose photos* offers the camera as well as your photo library. Up to 6 photos.

**If a link import fails**
- *"We couldn't find a recipe on that page"*: the page has no machine-readable recipe (and AI is off, or could not find one in the text). Paste the recipe text instead.
- *"That site does not let us read its pages"*: the site blocks servers (login wall, bot check). Paste the text instead.
- *"That address can’t be imported"*: only public web addresses (http or https) can be imported, never ones inside your home network.
- If the recipe's photo cannot be downloaded you still get the draft, with a note; add a photo yourself. The same goes for photos that are too big (over 10,000 px a side or 40 megapixels).
- Very long lists or text on a page are cut short (500 items, 10,000 characters per field) and the draft says so; cooking times over a week are left blank.
- Pages that take too long to read, or are built in an unreadable way, are treated as failed or recipe-less; use "paste the recipe text" instead.

Already saved that link? You'll be told "You already have this recipe" with a link to it; **Import anyway** continues if you want a second copy.

**Photos.** JPEG, PNG, WebP and iPhone/iPad HEIC photos all work, up to 6 per recipe; the pages are read in the order you pick them and become one recipe. If the AI can't find a recipe in them, or isn't available right now, your photos are still kept and shown beside an empty form. With AI **off**, *Keep photos and type it in* does the same straight away.

**Text.** Paste up to about 50,000 characters; anything longer is cut and the draft says so. Nothing is fetched from the address you add.

Imported recipes keep the source link and author credit. Recipes are for private household use.

_Status: link, photo and text import work — see [[Roadmap]]._
