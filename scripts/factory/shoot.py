# Screenshot every page in light and dark at desktop, iPad and phone size, signed in.
# Usage: SHOOT_USER=chris SHOOT_PASSWORD=... python3 scripts/factory/shoot.py <base-url> <out-dir> <recipe-id>
# Prints WARN lines for pages scrolled on load or overflowing horizontally.
import os
import sys

from playwright.sync_api import sync_playwright

base, out, rid = sys.argv[1], sys.argv[2], sys.argv[3]
user, password = os.environ.get("SHOOT_USER", "chris"), os.environ["SHOOT_PASSWORD"]
pages = {"home": "/", "recipe": f"/recipes/{rid}", "new": "/recipes/new", "edit": f"/recipes/{rid}/edit",
         "cook": f"/recipes/{rid}/cook", "import": "/import", "settings": "/settings",
         "notfound": "/recipes/00000000-0000-0000-0000-000000000000"}
sizes = {"desktop": (1440, 900), "ipad": (820, 1180), "phone": (390, 844)}
os.makedirs(out, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    for scheme in ("light", "dark"):
        ctx = browser.new_context(color_scheme=scheme)
        pg = ctx.new_page()
        pg.set_viewport_size({"width": 820, "height": 1180})
        pg.goto(base + "/login")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{out}/{scheme}-login-ipad.png")
        pg.get_by_label("Username").fill(user)
        pg.get_by_label("Password").fill(password)
        pg.keyboard.press("Enter")
        pg.wait_for_url(lambda u: "/login" not in u, timeout=10000)
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
