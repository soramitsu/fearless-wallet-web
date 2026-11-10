# Fearless brand: the Yatagarasu

The owner approved the Yatagarasu (three-legged crow) brand on 10 November 2026, replacing the winged-sun badge. The
same masters ship in the iOS, Android and browser apps. They come from the shared brand kit (workspace
`brand/yatagarasu`, generated from the design package `design/yatagarasu-20261110`). The kit's manifest hash is
recorded in `docs/release/brand-asset-provenance.json`.

| File | Use |
| --- | --- |
| `fearless-lockup-stacked.svg` | Full-page brand screens: onboarding start, unlock |
| `fearless-lockup-horizontal.svg` | Headers that carry the name |
| `fearless-crest.svg` | The crest alone, 64 px and above |
| `fearless-crest-small.svg` | The crest below 64 px |
| `fearless-crest-ink.svg` | The crest on pale surfaces |
| `fearless-wordmark.svg` | The FEARLESS wordmark alone |
| `crest-badge.svg`, `crest-badge-small.svg` | Round slots (logo, loader, QR centre, WalletConnect wallet, portfolio sun) |
| `hero/popup-*` | The animated crow on the onboarding start, framed for the 561x600 popup |

Rules:
- Use the primary crest at 64 px and above and the small crest below.
- Keep an eighth of the crest's width clear on every side.
- Use white on dark, ink on pale, or gold on plum.
- Keep pink for primary actions and active navigation.
- Never redraw, warp or re-serialise a mark; the files are exact copies of the masters.

`scripts/brand/masters` holds the masters, pinned by SHA-256. Regenerate the marks, icon-sprite aliases, extension
icons (`public/icons/logo-*.png`, `logo.icns`, `public/favicon.ico`) and the provenance record with
`node scripts/generate-brand-assets.mjs`; `--check` verifies every output without writing.

The generator needs Sharp 0.35.5. If it is installed outside this checkout, pass
`--sharp-module /absolute/path/to/sharp`. Run `node --test scripts/test-brand-assets.mjs` to check masters, aliases,
sizes, containers and provenance.

The welcome hero (`src/components/WelcomeHero.vue`) loops muted. Clicking the crow plays its call, an eagle's scream
breaking into a crow's caw, with sound when the sound toggle is on. Reduced motion, reduced effects and calm surfaces
show the still poster.

Brand colours live in `design/fw.tokens.json`. The kit's `tools/apply-tokens.mjs` moved the brand magentas to the
Yatagarasu pinks. Surfaces and text use the brand's ink palette, as the iOS and Android apps do:
- The page base is ink `#120A2E`.
- The raised, glass, chrome, sunken and scrim steps (raw `night`) are ink-hued versions of the former navy steps. Each
  keeps its OKLCH lightness offset from the base, so cards stand off the page as before.
- Pressed is `#2E1968`.
- Text uses the brand's warm whites. Tertiary text is a touch lighter than on the phones (`#A093C3`, Android
  `#978ABA`), so it keeps 4.5:1 on glass and selected rows over the aurora.
- Links and the focus ring stay cyan, because the brand pink reads only 3.8:1 on the aurora's brightest point.

`src/styles/fw-tokens.scss` is generated from the token file (`gen-fw-tokens.mjs --web`, sha256 in its header).
