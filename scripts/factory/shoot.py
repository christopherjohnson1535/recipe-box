# Screenshot every page in light and dark at desktop, iPad portrait + landscape and phone size, signed in.
# Usage: SHOOT_USER=chris SHOOT_PASSWORD=... python3 scripts/factory/shoot.py <base-url> <out-dir> [recipe-id]
#        [--pages a,b] [--schemes light,dark] [--sizes desktop,ipad,ipad-landscape,phone]
# The filters are comma-separated and default to everything; unknown names are an error. Example:
#   python3 scripts/factory/shoot.py http://localhost:3000 shots --pages recipe,cook --schemes light --sizes ipad,phone
# Pages: login (shot at ipad, desktop and phone only) plus the names in PAGE_NAMES below.
# Recipe ids come from GET /api/recipes after sign-in: the "rich" recipe is the one with the most ingredients and
# steps, the "long" one has the longest title. Pass a recipe id to use it as the rich one.
# Prints WARN lines for pages scrolled on load or overflowing horizontally.
import argparse
import json
import os
import sys

PAGE_NAMES = ("home", "home-q", "home-tag", "recipe", "recipe-long", "new", "edit", "cook", "groceries",
              "import-link", "import-photo", "settings", "notfound")
SCHEMES = ("light", "dark")
sizes = {"desktop": (1440, 900), "ipad": (820, 1180), "ipad-landscape": (1180, 820), "phone": (390, 844)}
LOGIN_SIZES = ("ipad", "desktop", "phone")


def pick(arg, valid, what):
    """Comma-separated filter -> names in `valid` order; exits listing the valid names on an unknown one."""
    if arg is None:
        return list(valid)
    want = [x for x in arg.split(",") if x]
    bad = [x for x in want if x not in valid]
    if bad or not want:
        sys.exit(f"unknown {what}: {', '.join(bad) or arg!r}. valid: {', '.join(valid)}")
    return [x for x in valid if x in want]


ap = argparse.ArgumentParser(description="Screenshot Recipe Box pages (see the header of this file).")
ap.add_argument("base_url")
ap.add_argument("out_dir")
ap.add_argument("recipe_id", nargs="?")
ap.add_argument("--pages", help="comma-separated: login," + ",".join(PAGE_NAMES))
ap.add_argument("--schemes", help="comma-separated: " + ",".join(SCHEMES))
ap.add_argument("--sizes", help="comma-separated: " + ",".join(sizes))
args = ap.parse_args()
sel_pages = pick(args.pages, ("login",) + PAGE_NAMES, "page")
sel_schemes = pick(args.schemes, SCHEMES, "scheme")
sel_sizes = pick(args.sizes, tuple(sizes), "size")
login_sizes = [z for z in LOGIN_SIZES if z in sel_sizes] if "login" in sel_pages else []
page_names = [n for n in PAGE_NAMES if n in sel_pages]
if not (login_sizes or page_names):
    print("WARN nothing to shoot: login is shot at ipad, desktop and phone only")
    sys.exit(1)

from playwright.sync_api import sync_playwright  # noqa: E402  (after validation: bad names fail before the browser)

base, out = args.base_url.rstrip("/"), args.out_dir
user, password = os.environ.get("SHOOT_USER", "chris"), os.environ["SHOOT_PASSWORD"]
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
    for scheme in sel_schemes:
        ctx = browser.new_context(color_scheme=scheme)
        # The edition follows the clock by default; pin it so "light"/"dark" shots show day/evening at any hour.
        edition = "day" if scheme == "light" else "evening"
        ctx.add_init_script(f"try {{ localStorage.setItem('rb-edition', '{edition}') }} catch {{}}")
        pg = ctx.new_page()
        for size in login_sizes:
            pg.set_viewport_size({"width": sizes[size][0], "height": sizes[size][1]})
            pg.goto(base + "/login", wait_until="networkidle" if size != "ipad" else "load")
            if size == "ipad":
                pg.wait_for_timeout(500)
            pg.screenshot(path=f"{out}/{scheme}-login-{size}.png", full_page=size != "ipad")
        if not page_names:
            ctx.close()
            continue
        sign_in(pg)

        items = (api(ctx, "/recipes?limit=200") or {}).get("items", [])
        details = [d for d in (api(ctx, f"/recipes/{i['id']}") for i in items) if d]
        rich = max(details, key=lambda d: len(d["ingredients"]) + len(d["steps"]), default=None)
        long_ = max(details, key=lambda d: len(d["title"]), default=None)
        rid = args.recipe_id or (rich["id"] if rich else "00000000-0000-0000-0000-000000000000")
        lid = long_["id"] if long_ else rid
        tags = api(ctx, "/tags") or []
        tag = max(tags, key=lambda t: t["count"])["name"] if tags else "dinner"
        pages = {"home": "/", "home-q": "/?q=" + (items[0]["title"].split()[0] if items else "a"),
                 "home-tag": f"/?tag={tag}", "recipe": f"/recipes/{rid}", "recipe-long": f"/recipes/{lid}",
                 "new": "/recipes/new", "edit": f"/recipes/{rid}/edit", "cook": f"/recipes/{rid}/cook",
                 "groceries": "/groceries", "import-link": "/import", "import-photo": "/import?mode=photo", "settings": "/settings",
                 "notfound": "/recipes/00000000-0000-0000-0000-000000000000"}
        assert set(pages) == set(PAGE_NAMES)
        for size in sel_sizes:
            pg.set_viewport_size({"width": sizes[size][0], "height": sizes[size][1]})
            for name in page_names:
                path = pages[name]
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
