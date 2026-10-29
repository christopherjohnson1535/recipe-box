# Using on iPad

## Add to Home Screen
1. Open Recipe Box in **Safari** at its **HTTPS** address. Home Screen apps, the wake lock and offline all need a secure
   address: use Tailscale serve or the Caddy profile (see [[Deploying]]).
2. Tap **Share** → **Add to Home Screen** → **Add**. The icon is a white R on charcoal with a saffron line under it.
3. Open it from the Home Screen. It launches **standalone**: full screen with no Safari address bar or tabs, and it keeps
   its own place in the app switcher. Links to other sites open in Safari.

The status bar at the top stays the normal system one and sits above the page, which starts just below it. Content also
stays clear of the Home indicator along the bottom edge.

Installed apps do not follow Safari's tabs: sign in again if you are asked to, and if you change the server address, remove
the icon and add it again. Long-press the icon for shortcuts (**Import a recipe**, **Write a recipe**).

## Cooking mode
Open a recipe → **Start cooking**. Cooking mode is always dark (the evening colours), in large type you can read from across the counter.
- **Move on** with the **Next step** and **Back** buttons, by swiping left or right anywhere on the screen, or with the arrow keys.
- **For this step** lists the ingredients the step names, bright, followed by the rest, dimmed. Held upright only the ones the step names appear, as chips above the step; tap **+N more** for the rest.
- **Timers**: tap a time written in the step to start a timer. Times in figures or words both work: "10 minutes", "1½ hours", "1 hour 30 minutes", "twenty minutes", "half an hour", "an hour and a half", "a minute and a half", "a 10-minute rest"; for a range ("10-12 minutes") the timer is set to the shorter time, so you check early. Several can run at once, and they keep going when you change step, switch views or move to another dish. While a timer runs its pill turns gold and shows the time left; tapping it again doesn't start a second one. A finished timer moves to the front, flashes and chimes for ten seconds, then stays gold until you tap **Dismiss** (dismissing it also stops the chime). Tap a finished time in the step to start it again. **Close** asks first while a timer is running, since closing stops the timers.
- **Timer sound**: **Timer sound on** at the top turns the chime off and on; the iPad remembers your choice. The chime needs one tap on the page first (a browser rule), and an iPad with its silent switch or Focus on may stay quiet, so the flashing is the alert you can always rely on. On Android phones and tablets a finished timer also vibrates; iPads and iPhones don't let web pages vibrate. If the browser can't play sound, the switch isn't shown. With reduced motion turned on, a finished timer turns gold and stays gold instead of flashing.
- **Voice** (where the browser supports it, such as Safari): turn it on at the top right and say "next", "back" or "repeat". Without support the switch is not shown.
- With reduced motion turned on in the device settings, nothing slides or spins; colours still change.
- A line at the bottom previews the next step.
- **One step or All steps**: switch at the top. *One step* shows a single step at a time; *All steps* lists the whole method so you can read ahead. The iPad remembers which you prefer.
- **Tick things off**: tap an ingredient to strike it through, and tap **Done** beside a step when you finish it. Ticks are kept on that iPad for 12 hours, so if the app reloads mid-cook you come back to the first step you haven't finished. Tap **Clear ticks** to start over.

### Cooking two dishes at once
When two or more dishes have to be ready together, cook them in one session. Up to four at a time.
- **From a recipe**: open it and tap **Cook together**. That recipe is already chosen; tap one to three more, then **Start cooking**. **Start cooking** stays off until two are chosen, and the bar says "Choose one more dish". Use the search box at the top to find a dish in a big box; the ones you have chosen stay on screen while you search.
- **From the home page**: tap **Select recipes**, tap the dishes in the order you want them, then **Cook together** (it needs two to four chosen, and the bar says so while it is greyed out; **Add to groceries** is beside it).
- **Every step shows its dish.** Each dish has its own mark, a letter in a coloured circle or square, solid or outlined, with the name beside it at the top of the screen and above each step, so you can tell them apart even without the colours. The ingredients column has a tab for each dish; it follows the step you are on, and you can open another dish's tab to look ahead.
- **Three views**, switched at the top: *One step* (the same big step with Back and Next, plus a button to bring another dish's next step here), *All steps* (the whole combined list), and *By dish* (a column for each dish on an iPad held sideways, stacked when held upright). The iPad remembers the one you picked.
- **The order is yours.** It starts by alternating between the dishes (first step of each, then second of each, and so on). In *All steps*, tap the up or down arrow beside a step to move it earlier or later past a step of another dish; a dish's own steps always stay in their own order. In *One step*, **Bring [dish]'s next step here** pulls that dish's next step to come right after this one. **Reset order** puts it back to alternating. The order is kept on that iPad for 12 hours, so a reload mid-cook picks up where you were.
- **Ticks are kept per dish.** Tap **Done** beside a step, or an ingredient, and it is ticked for that dish only, the same ticks as when you cook the recipe on its own, so starting one of them alone later shows what you already did. **Clear ticks** clears them for all the dishes in the session.
- **Finish** (or **Close**) takes you back to the recipes home. A dish whose next step is already next has no "Bring…" button.
- **Offline**: a session you have opened on the iPad is kept like a recipe, so it opens again without internet (the same dishes in the same order; a different combination is a different session and is not kept until you open it). Open the session while you are online before you rely on it.
- Timers carry the dish's name ("Ragu · Step 2 · 10 min") and keep running when you change step, view or dish; the same time in two dishes is two timers. Swipe, arrow keys, voice and the screen staying awake work as in cooking mode (see below); swipe, arrows and voice move through *One step* only.

### Made it
On the last step (and in *All steps*), a line above the bottom bar asks **Cooked it?** Tap **Made it** to note it in the
recipe's log with anything you'd change next time; it shows up under the method on the recipe page. The day is today on
this iPad unless you pick another. If you go back a step, what you typed stays. Offline, the form still opens and keeps
your note, but **Save to the log** stays off until you're back online: nothing is sent later on its own.

### Keeping the screen awake
While cooking mode is open the screen won't lock; the top of the screen says **Screen stays on**. This needs the Home Screen app on iPadOS 18.4 or later, and a secure (https) address — see [[Deploying]]. If it can't keep the screen awake you'll see **Screen may sleep**; tap it for what to do. The simplest fallback is **Settings → Display & Brightness → Auto-Lock → Never** while you cook.

## Offline
Recipes you've opened on the iPad stay readable without internet, photos and cooking mode included. Open the ones
you'll cook from while you're online: opening a recipe once keeps it, its photo and its cooking mode. Your
**favourites** (the recipes you starred, up to the 30 newest) are kept as well, even ones you never opened on this iPad:
open Recipe Box once while you're online and it fetches them in the background.
- With no connection a banner says **You're offline**. Saving, deleting, importing, search, settings and the made-it log need the
  connection: **Save**, **Delete** and the import buttons are turned off, and Save and Import say why beside them. What you typed in a recipe stays on the page until
  you're back online.
- A page that wasn't kept shows **You're offline** with the list of recipes this iPad can still open, your favourites first.
- Starring a recipe needs the connection: offline the star is dimmed and turned off. Nothing is saved to send later.
- Online, you always see the server's latest copy; the kept copy is only used when the server can't be reached.
- The iPad keeps about the last 100 recipe pages and 300 photos, each for up to 30 days after you last opened it.
- **Sign out** removes every kept recipe and photo from the iPad, and so does an expired sign-in. Nothing is shown
  from the offline copy to someone who isn't signed in.
- Offline needs the Home Screen app or Safari on the **HTTPS** address (see [[Deploying]]). iPadOS may clear offline
  data when storage is low; the server always has the real copy.

## Evening colours
After 7 pm Recipe Box switches to its darker evening colours, which are easier on the eyes at dinnertime, and back to
the light day colours at 7 am. To change it, open **Settings → Appearance** and choose *By the clock*, *Always day*, *Always evening*
or *Follow this device*. The choice is remembered on that iPad only. More in [[Appearance and Layout]].

## Camera import
Import → Photo → take a picture of the cookbook page. See [[Importing Recipes]].

_Status: Phase 3 — see [[Roadmap]]._
