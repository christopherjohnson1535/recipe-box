# Using on iPad

## Add to Home Screen
1. Open Recipe Box in **Safari** at its **HTTPS** address. Home Screen apps, the wake lock and offline all need a secure
   address: use Tailscale serve or the Caddy profile (see [[Deploying]]).
2. Tap **Share** → **Add to Home Screen** → **Add**. The icon is a cream R on claret.
3. Open it from the Home Screen. It launches **standalone**: full screen with no Safari address bar or tabs, and it keeps
   its own place in the app switcher. Links to other sites open in Safari.

The status bar at the top stays the normal system one and sits above the page, which starts just below it. Content also
stays clear of the Home indicator along the bottom edge.

Installed apps do not follow Safari's tabs: sign in again if you are asked to, and if you change the server address, remove
the icon and add it again. Long-press the icon for shortcuts (**Import a recipe**, **Write a recipe**).

## Cooking mode
Open a recipe → **Start cooking**. Cooking mode is always dark (the evening edition), in large type you can read from across the counter.
- **Move on** with the **Next step** and **Back** buttons, by swiping left or right anywhere on the screen, or with the arrow keys.
- **For this step** lists the ingredients the step names, bright, followed by the rest, dimmed. Held upright only the ones the step names appear, as chips above the step; tap **+N more** for the rest.
- **Timers**: tap a time written in the step ("10 minutes") to start a timer. Several can run, and they keep going when you change step. A finished timer flashes red and chimes for ten seconds, then stays red (the chime needs one tap on the page first, a browser rule); tap **Dismiss** to clear it. **Close** asks first while a timer is running, since closing stops the timers.
- **Voice** (where the browser supports it, such as Safari): turn it on at the top right and say "next", "back" or "repeat". Without support the switch is not shown.
- With reduced motion turned on in the device settings, nothing slides or spins; colours still change.
- A line at the bottom previews the next step.
- **One step or All steps**: switch at the top. *One step* shows a single step at a time; *All steps* lists the whole method so you can read ahead. The iPad remembers which you prefer.
- **Tick things off**: tap an ingredient to strike it through, and tap **Done** beside a step when you finish it. Ticks are kept on that iPad for 12 hours, so if the app reloads mid-cook you come back to the first step you haven't finished. Tap **Clear ticks** to start over.

### Keeping the screen awake
While cooking mode is open the screen won't lock; the top of the screen says **Screen stays on**. This needs the Home Screen app on iPadOS 18.4 or later, and a secure (https) address — see [[Deploying]]. If it can't keep the screen awake you'll see **Screen may sleep**; tap it for what to do. The simplest fallback is **Settings → Display & Brightness → Auto-Lock → Never** while you cook.

## Offline
Recipes you've opened before stay readable without internet. Saving and importing need a connection. iPadOS may
clear offline data when storage is low — the server always has the real copy.

## Evening edition
After 7 pm Recipe Box switches to its darker evening edition, which is easier on the eyes at dinnertime, and back to
the light day edition at 7 am. To change it, open **Settings → Appearance** and choose *Always day*, *Always evening*
or *Follow this device*. The choice is remembered on that iPad only.

## Camera import
Import → Photo → take a picture of the cookbook page. See [[Importing Recipes]].

_Status: Phase 3 — see [[Roadmap]]._
