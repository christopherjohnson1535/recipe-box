# Adding and editing recipes

Use **Add a recipe** to type one in, or **Edit** on a recipe to change it. The same form is used when you check an
imported draft.

## The form
- **Title** is the only required field. Description, servings, prep/cook/total minutes, tags, photo, source and notes
  are optional.
- **Photo**: choose an image to upload it; a preview appears. Choose another to replace it, or **Remove photo**.
  Every photo is also given a print-style version (a tidy crop, evened-out brightness and colour, softer tones, a faint paper tint and a little grain) so
  snapshots, scans and blog photos look like one set. Your original is kept untouched and can still be opened
  full size. Photos added before this existed are converted in the background the next time the app starts.
  An admin can switch the print style off for the household under **Settings**.
- **Tags**: type a tag and press comma or Enter. Tags you have used before are suggested. Use the cross to remove one.

## Ingredients and method
- **Add ingredient** / **Add step** adds a row. In an ingredient, Enter starts the next row.
- **Paste a list**: paste several lines into a row and each line becomes its own row. Bullets and numbers
  ("1.", "-", "•") and blank lines are removed. Into a filled row, the lines are added after it.
- **Move up / down** and **Remove** buttons sit under each row. They work with the keyboard (Tab, then Enter or Space).
- **Sections**: the **Section** button starts a section at that row ("For the sauce"). The section runs until the next
  heading. Section headings stay put when you move items: use the up and down arrows to move an item into or out of a
  section.
  A blank heading under a section reads "No heading: continues without a section" and ends that section; its
  remove button then says "Join … to the previous section".

## Saving
- **Save** adds the recipe or replaces the saved one, then opens it.
- If something is wrong, the message appears under the field (for example a negative number of minutes) or at the
  top of the form, and the cursor moves to the first problem.
- Closing or reloading the page with unsaved changes asks first, and so does **Cancel**.
- Unsaved changes are also kept for the browser session. If you leave by accident (the iPad does not ask), the form offers
  **Restore** or **Discard** next time you open it.
- Prep, cook and total minutes take whole numbers from 0 to 10,000.

## Deleting and undo
- **Delete** on a recipe removes it straight away (there is no "are you sure") and takes you home.
- A message at the bottom reads **Deleted "Name". Undo** and stays for 10 seconds. Delete several recipes and each gets its own message (the three newest show). It pauses while you hover over it or
  have it selected. **Undo** puts the recipe back and opens it; the cross closes the message.
- If the time has passed, the message says it is too late to undo. If the recipe was already deleted elsewhere, you go home
  and a short message says so.

## Reading a recipe
A recipe opens with the title, a one-line summary and who added it on the left and the photo on the right (on an iPad held upright or a phone the photo comes below the title). Under it, large numbers show how many it **serves** and the **prep**, **cook** and **total** times (only the ones the recipe has).
- **Ingredients**: tap a row to cross it off (a red line is drawn through it); tap again to undo. Ticks stay while the tab is open, even if you reload, and are separate for each recipe. The bar at the bottom counts them and has **Start cooking**. Fractions are shown as ½, 1½ and so on; a line with a second amount ("2 cups plus 2 tbsp", "1 cup/240 ml") is not scaled.
- **Scale**: **½×**, **1×** and **2×** above the ingredients change the amounts (and the number served). A line that doesn't start with a number ("salt to taste") stays as written. Scaling is only for reading: it never changes the saved recipe.
- **Method**: an ingredient named in a step has a dotted underline that jumps to its row, and a time in the text ("12 minutes") is shown in a small pill with a clock. On the recipe page the pills are only a marker; in cooking mode a tap starts a timer (see [[Using-on-iPad]]).
- A recipe's **notes** appear as a quotation: in a column beside the method on a wide screen (about 1440 pixels and up), under the method on a smaller one.
- If your device is set to reduce motion, nothing slides, turns or draws; colours still change.

## Made it
Under the method, **Made it** keeps the household's log of when each recipe was cooked, newest first: the day, who made it
("You" for your own), and what they'd change next time ("less salt", "a hotter oven"). The heading counts them ("Made 3 times").
- **Made it** opens a short form: the day (today by default, on your device's calendar; any earlier day works too) and an
  optional note of up to 2,000 characters. **Save to the log** adds it to the list.
- You can **Delete** your own entries; an admin can delete anyone's. There is no undo.
- When a recipe is deleted, its log goes with it, and **Undo** brings the log back. Once the recipe is gone for good (a day
  after deleting), the log is gone too.
- When a member is removed, their entries stay, signed "A former member".
- Offline, the log shows what was there the last time the page was opened; adding and deleting wait for the connection.
- The log isn't printed and isn't part of **Export** (the zip has the recipes only). The server backups (`scripts/backup.sh`) include it.

## Printing
Print a recipe from your browser (Ctrl/Cmd+P). The menu, buttons, scale control, bottom bar and ticks are left out and times are plain words; you get black text on white
with the ingredients, the numbered method, notes and the source address. Steps are kept whole across pages where possible.

## Who added it
Under the title: "Added by Name on date", and "Edited by Name on date" when someone else, or a later edit, changed it.
