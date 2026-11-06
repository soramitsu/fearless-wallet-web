# Approved Fearless sun-disc artwork

The artwork originates in Figma file `6nJRypk3njagBkp9B642tg`, frame
`60201-10535`, exported on 10 October 2026. The colour, silhouette and feather
lockups remain unchanged. The two circular badges implement the design approved
on 6 November 2026: SORA disc radius 64 (original 33.85), a 2.2-unit gradient
joint, and no cobras or their centre bridges. Every retained wing contour is
copied byte-for-byte from the original export, without scaling or reshaping.
The original badge masters are preserved in `scripts/brand/masters`; the parent
workspace's `brand/sun-disc` also retains all five original exports.

Use the line-art badge for app icons above 32px and the solid badge at 16/32px.
Use the colour lockup for onboarding and unlock; the silhouette is the compact
header and QR mark. Generated public icons retain the existing filenames and
application identifiers. The external-image placeholder is neutral artwork,
so unavailable token or site images do not appear to be Fearless-branded assets.

`fearless-cuneiform.svg` outlines the approved `𒉡𒉎𒋼` signature from the bundled
Noto Sans Cuneiform regular font. It contains paths only and needs no system
font. Its SIL Open Font License is in `NotoSansCuneiform-OFL.txt`.
The same outline is copied into the SVG sprite under `src/assets/icons`.

The onboarding signature makes one1000ms entrance and then settles. Reduced
motion, Reduced effects, forced colours and Calm surfaces suppress the motion.
Shared loading indicators use static badge art; no glyph animation is added
to signing, recovery or transaction surfaces.

Master, raster and motif provenance is recorded with the release evidence.
Regenerate with `node scripts/generate-brand-assets.mjs`; append `--check` to
verify every output without modifying files. This needs Sharp 0.35.5; if it is
installed outside this checkout, pass `--sharp-module /absolute/path/to/sharp`.
For example, install it with `npm install --prefix /tmp/fearless-brand-tools
--no-audit --no-fund sharp@0.35.5`, then use
`--sharp-module /tmp/fearless-brand-tools/node_modules/sharp`.
Run `node --test scripts/test-brand-assets.mjs` to check preserved contours,
disc geometry, aliases, container representations and provenance hashes.
