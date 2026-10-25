# Icon set

Original monogram: a Marcellus capital R in paper (`--chalk-50`, `#f4f4f1`) on band charcoal (`--slate-900`,
`#22262b`), with a saffron rule (`--saffron-350`, `#e9b75a`) under it. The R is the font's own outline converted to an
SVG path, so no file here needs the font. Riviera restyle, ADR 0009.

Files (all in `public/`): `icon.svg`, `icon-32.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (full-bleed,
mark inside the central 80%), `apple-touch-icon.png` (180, opaque), `shortcut-96.png`, `screenshots/*.png`.

## Regenerating
Needs `fonttools` and Playwright for Python. The glyph comes from the `.woff` (the `.woff2` also needs `brotli`).
The generator: read the `R` outline with `fontTools.pens.svgPathPen.SVGPathPen` from
`node_modules/@fontsource/marcellus/files/marcellus-latin-400-normal.woff` (bounds x 143..1262, cap height 1446 of
2048 units; measure with `fontTools.pens.boundsPen.BoundsPen`), scale it to a 290 px cap height on a 512 viewBox,
centre the R plus a rule (13% of the cap height below it, 4 px thick, 105% of the R's width) as one group, and fill
the background `#22262b` (rounded `rx=112` for `icon.svg`, full-bleed for maskable, apple and shortcut, cap height
250 for maskable). The 32 px icon drops the rule and uses a 340 px R. Render each SVG at its size with Chromium
(`page.screenshot(omit_background=True)` for the rounded ones) for the PNGs.
Screenshots are the signed-out `/login` page captured at 1280x800 and 750x1334.
