# Screenshot every page in light and dark at desktop, iPad portrait + landscape and phone size, signed in.
# Usage: SHOOT_USER=chris SHOOT_PASSWORD=... python3 scripts/factory/shoot.py <base-url> <out-dir> [recipe-id]
# Recipe ids come from GET /api/recipes after sign-in: the "rich" recipe is the one with the most ingredients and
# steps, the "long" one has the longest title. Pass a recipe id to use it as the rich one.
# Prints WARN lines for pages scrolled on load or overflowing horizontally.
import json
import os
import sys

from playwright.sync_api import sync_playwright

base, out = sys.argv[1].rstrip("/"), sys.argv[2]
user, password = os.environ.get("SHOOT_USER", "chris"), os.environ["SHOOT_PASSWORD"]
sizes = {"desktop": (1440, 900), "ipad": (820, 1180), "ipad-landscape": (1180, 820), "phone": (390, 844)}
os.makedirs(out, exist_ok=True)


def sign_in(pg):
    pg.goto(base + "/login")
    pg.wait_for_timeout(500)
    pg.get_by_label("Username").fill(user)
    pg.get_by_label("Password").fill(password)
    pg.keyboard.press("Enter")
    pg.wait_for_url(lambda u: "/login" not in u, timeout=10000)


def api(ctx, path):
    r = ctx.request.get(base + "/api" + path)
    return json.loads(r.text()) if r.ok else None


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    for scheme in ("light", "dark"):
        ctx = browser.new_context(color_scheme=scheme)
        # The edition follows the clock by default; pin it so "light"/"dark" shots show day/evening at any hour.
        edition = "day" if scheme == "light" else "evening"
        ctx.add_init_script(f"try {{ localStorage.setItem('rb-edition', '{edition}') }} catch {{}}")
        pg = ctx.new_page()
        pg.set_viewport_size({"width": 820, "height": 1180})
        pg.goto(base + "/login")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{out}/{scheme}-login-ipad.png")
        for size in ("desktop", "phone"):
            pg.set_viewport_size({"width": sizes[size][0], "height": sizes[size][1]})
            pg.goto(base + "/login", wait_until="networkidle")
            pg.screenshot(path=f"{out}/{scheme}-login-{size}.png", full_page=True)
        sign_in(pg)

        items = (api(ctx, "/recipes?limit=200") or {}).get("items", [])
        details = [d for d in (api(ctx, f"/recipes/{i['id']}") for i in items) if d]
        rich = max(details, key=lambda d: len(d["ingredients"]) + len(d["steps"]), default=None)
        long_ = max(details, key=lambda d: len(d["title"]), default=None)
        rid = sys.argv[3] if len(sys.argv) > 3 else (rich["id"] if rich else "00000000-0000-0000-0000-000000000000")
        lid = long_["id"] if long_ else rid
        tags = api(ctx, "/tags") or []
        tag = max(tags, key=lambda t: t["count"])["name"] if tags else "dinner"
        pages = {"home": "/", "home-q": "/?q=" + (items[0]["title"].split()[0] if items else "a"),
                 "home-tag": f"/?tag={tag}", "recipe": f"/recipes/{rid}", "recipe-long": f"/recipes/{lid}",
                 "new": "/recipes/new", "edit": f"/recipes/{rid}/edit", "cook": f"/recipes/{rid}/cook",
                 "import-link": "/import", "import-photo": "/import?mode=photo", "settings": "/settings",
                 "notfound": "/recipes/00000000-0000-0000-0000-000000000000"}
        for size, (w, h) in sizes.items():
            pg.set_viewport_size({"width": w, "height": h})
            for name, path in pages.items():
                pg.goto(base + path, wait_until="networkidle")
                pg.wait_for_timeout(300)
                sy = pg.evaluate("window.scrollY")
                ov = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
                if sy or ov:
                    print("WARN", scheme, size, name, "scrollY", sy, "overflow", ov)
                pg.screenshot(path=f"{out}/{scheme}-{name}-{size}.png", full_page=True)
        ctx.close()
    browser.close()
print("done", out)
