# Screenshot every page in every theme at desktop and phone size. Usage: python3 shoot.py <base-url> <out-dir> [themes...]
import sys, json, os, urllib.request
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
themes = sys.argv[3:] or ["material", "claude", "cupertino"]
pages = {"library": "/", "import": "/import", "settings": "/settings",
         "shoot": "/shoots/2026/Red%20Rocks", "cull": "/shoots/2026/Red%20Rocks/cull",
         "finished": "/shoots/2026/Red%20Rocks/finished", "notfound": "/shoots/2026/Nope"}
sizes = {"desktop": (1440, 900), "phone": (390, 844)}
os.makedirs(out, exist_ok=True)
def put_theme(t):
    req = urllib.request.Request(base + "/api/settings", data=json.dumps({"theme": t}).encode(), method="PUT", headers={"Content-Type": "application/json", "Origin": base})
    urllib.request.urlopen(req).read()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    for t in themes:
        put_theme(t)
        for sname, (w, h) in sizes.items():
            pg = b.new_page(viewport={"width": w, "height": h})
            for name, path in pages.items():
                pg.goto(base + path, wait_until="networkidle")
                pg.wait_for_timeout(700)
                pg.screenshot(path=f"{out}/{t}-{name}-{sname}.png", full_page=(sname == "desktop"))
            # interaction states on desktop: loupe open + hover/focus on first card
            if sname == "desktop":
                pg.goto(base + pages["shoot"], wait_until="networkidle"); pg.wait_for_timeout(500)
                pg.keyboard.press("Tab"); pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
                pg.screenshot(path=f"{out}/{t}-shoot-focus-desktop.png")
                tiles = pg.locator("main img")
                if tiles.count():
                    tiles.first.click(); pg.wait_for_timeout(800)
                    pg.screenshot(path=f"{out}/{t}-loupe-desktop.png")
            pg.close()
    b.close()
print("done", out)
