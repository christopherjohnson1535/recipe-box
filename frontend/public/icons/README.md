# Icon set

Original monogram: a Libre Caslon Display capital R with a hairline rule under it, cream (`--cream-50`) on claret
(`--claret-700`). The R is the font's own outline converted to an SVG path, so no file here needs the font.

Files (all in `public/`): `icon.svg`, `icon-32.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (full-bleed,
mark inside the central 80%), `apple-touch-icon.png` (180, opaque), `shortcut-96.png`, `screenshots/*.png`.

## Regenerating
Needs `fonttools` and Playwright for Python. The glyph comes from the `.woff` (the `.woff2` also needs `brotli`).
The generator: read the `R` outline with `fontTools.pens.svgPathPen.SVGPathPen` from
`node_modules/@fontsource/libre-caslon-display/files/libre-caslon-display-latin-400-normal.woff`
(bounds x 40..647, cap height 690 of 1000 units), scale it to a 290 px cap height on a 512 viewBox, centre the R plus a
rule (13% of the cap height below it, 4 px thick) as one group, and fill `#9b1c1c` (rounded `rx=112` for `icon.svg`,
full-bleed for maskable and apple, cap height 250 for maskable). The 32 px icon drops the rule and uses a 340 px R.
Render each SVG at its size with Chromium (`page.screenshot(omit_background=True)`) for the PNGs.
Screenshots are the signed-out `/login` page captured at 1280x800 and 750x1334.
