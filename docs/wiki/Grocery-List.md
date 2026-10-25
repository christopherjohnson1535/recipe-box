# Grocery List

One shopping list for the whole household. Add recipes to it, then shop from your phone: the items are grouped the way a shop is laid out, and everyone sees each other's ticks.

## Adding recipes
- **From a recipe.** Open the recipe, set the scale you want (½×, 1× or 2×) and tap **Add to groceries** under the ingredients. The recipe goes on the list at that scale. Tap the button again after changing the scale to update it.
- **Several at once.** On the home page tap **Select recipes**, tap the cards you want, then **Add N to groceries**. Each goes on at 1×; change the scale on the list page.

The ingredients of every recipe are combined. "2 onions" from one recipe and "1 onion" from another become "3 onions". Amounts in different units stay side by side under one name ("1 cup + 2 tbsp milk"). A line that can't be read as an amount, like "salt to taste", is kept as it is.

## Shopping
Open **Groceries** in the top bar. The number beside it is how many items are left to buy.

- Items are grouped **Produce, Meat, Fridge, Freezer, Pantry, Other**. Only sections with something in them show, and the section name stays at the top of the screen while you scroll through it.
- **Tap an item to cross it off.** A line is drawn through it and it drops to the bottom of its section. Tap again to undo.
- If a change can't be saved, a message appears at the bottom of the screen and the change is undone.
- **Recipes on this list** sit at the top: change the servings with the − and + buttons (½×, 1×, 2×) or take a recipe off the list. The amounts update.

## The item menu (the three dots)
- **Move to** another section. Recipe Box remembers: the next list puts that item there.
- **Mark as staple** for things you always have (salt, pepper, water start out that way). Staples are hidden; **Show staples** brings them back. **Not a staple** undoes it.
- **Remove** takes the item off the list.

## Adding your own items
Type in the **Add an item** box: "paper towels" or "2 lb potatoes". The amount is read the same way as in a recipe.

## Finishing up
- **Clear ticked** removes everything you've crossed off.
- **Empty list** removes every recipe and item (it asks first). Your staples and section choices are kept.

## Sending the list somewhere else
Under the list, **Send to…** takes what is still to buy out of Recipe Box as plain text. Ticked items are left out, and so are staples unless **Show staples** is on.

- **Share list** appears on iPad, iPhone and other devices with a share sheet. Pick Notes, Reminders, Keep, Messages or any app that takes text.
- **Copy list** appears where there is no share sheet (a computer, say). It copies the text; paste it anywhere.

The text starts with "Groceries", then each store section with its items under it:

```
Groceries

Produce
- 2 cloves garlic

Fridge
- 1 cup + 2 tbsp milk
```

### Google Tasks
If your household has switched on Google Tasks, **Send to Google Tasks** puts the list in your own Google account, so you can shop from the Google Tasks app or Gmail's side panel. If the button isn't there, Google Tasks is off for your household: ask whoever looks after Recipe Box (the admin) to follow the **Google Tasks** section of the [deploy guide](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#google-tasks-optional).

1. **Connect once.** Tap **Connect Google Tasks** (here, or in **Settings > Google Tasks**). You go to Google's page to allow access, then land back in Settings. Everyone connects their own Google account. Google says the app is unverified; that is expected, choose **Continue**.
2. **Send.** Tap **Send to Google Tasks**. A list called **Groceries** appears in Google Tasks with one task per store section (Produce, Meat, Fridge, Freezer, Pantry, Other) and each item as a subtask under it ("1 cup + 2 tbsp milk"). Recipe Box tells you how many items it sent.
3. **Send again whenever the list changes.** Each send replaces what is in the Google list, so it never doubles up. Anything you added to that Google list by hand is replaced too, and so is any other list of yours that is called Groceries: keep your own lists under another name. Ticking in Google Tasks does not tick the item in Recipe Box.

To stop, choose **Disconnect** in **Settings > Google Tasks**. The tasks already in Google stay where they are.

**Reconnecting every week.** While your household's Google app is in Google's "Testing" mode, Google ends the connection after 7 days. The next send then says Google Tasks isn't connected and offers **Reconnect Google Tasks**; one tap and you're back, and the same Groceries list is reused. The admin can end this by following the [deploy guide](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#google-tasks-optional), which explains the 7-day limit.

If a send fails part way, the Google list may be half filled; send again and it starts over. Sending needs a connection, so the button is off while you are offline. Share and Copy work offline.

## Sharing and syncing
Everyone signed in sees the same list. It checks for changes when you come back to the page and every 20 seconds while it's open, so two people in the shop don't buy the same thing twice.

## Offline
Open the list once with a connection and it stays readable with no signal, for example inside a shop with poor reception. While offline you can read it but not tick, add or remove (the buttons are switched off and say why); once you have signal again they work. See [[Using on iPad]] for what else is kept offline.
