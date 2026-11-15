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
| `hero/popup-launch-ignite.webm`, `hero/launch-timeline.json` | The launch: the crow's Ignite and the dive into the wallet (kit v3) |
| `audio/send.m4a`, `audio/receive.m4a` | The send and receive sounds (kit v3) |
| `solar-geometry.json` | The solar geometry as strokes and their draw order: the send ignite and the wallet home's rings (kit v3) |
| `sky/sky-card.webp` | The sunset sky behind the wallet home's balance (kit v3) |
| `shikiban.json` | The instrument's numbers: the launch flight, the mirror, the sync dial, the seal, the loader, the lattice (kit v4) |

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

Kit v3 (2026-11-13, "Launch, feel and sound") adds the files above, copied verbatim and pinned in
`scripts/generate-brand-assets.mjs` (`KIT_COPIES`). The code is in `src/feel`:
- The launch (`launchOverlay.ts`, started by the popup entry) plays the Ignite over the first wallet view of a browser
  session, holds on the open wings until the wallet is ready, then flies into the wallet (kit v4, below). Later views
  get a short arrival; site request windows get neither; reduced motion and Reduced paint get a fade. A click or a key
  hurries it, and a key still reaches the page. Harness builds leave it off unless the page is opened with
  `?fw-launch=force`.
- The send sound and the solar ignite play when a transfer, a cross-chain send or an NFT is sent
  (`ConfirmationPasswordPopup.vue`). Tokens arriving (`arrivals.ts`: a known balance of the selected wallet grows, never a
  first value, a hidden or unverified asset, or a hidden page; one effect per 3 s) play the receive sound, pulse the
  balance card gold and show a toast. Settings > Sound effects turns the sounds off; nothing plays from the background.
- The wallet home sets its balance on the sky card with the solar rings turning at its sides, counts the total to its
  value, gives Send the pink fill and a slow sheen, lets the first list rise in, drifts a soft aurora behind it, and gives
  cards and the tab bar the lit rim. All of it stops under reduced motion and Reduced paint.

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

Kit v4 (2026-11-15, "Shikiban: depth, instruments and sacred geometry") makes the wallet read as an instrument: a round
heaven plate over a square earth plate. Sizes and durations step by 1/√2; depth is a scale of `p / (p + z)` about a
point; motion reports state (gold is final, cyan is in flight, ember is failure). The numbers are `shikiban.json`; the
formulas are `src/feel/shikiban.ts`, held to the kit's sampled keyframes by `tests/unit/feel-shikiban.spec.ts`.
- The launch flight (`launchOverlay.ts`, `shikibanDraw.ts`): from the clip's dive, six gates (circle over square, each
  1/√2 of the last, then the eight-lobed mirror) rush out of the focus, the mirror opens on the wallet far off, and the
  wallet flies up and settles. Parts of the screen marked `data-fw-depth` (0 nearest: the balance, then the actions, the
  header and tab bar, the tabs, the list) fly at their own depths; a screen that marks nothing flies as one piece.
- The sync dial (`SyncDial.vue`, in the balance card's status): eight segments lit to the share of the wallet's networks
  that have answered, ember for those that gave up, a cyan comet and the count ("9 / 14") while any are outstanding.
  The card's tick ring turns 14 times faster meanwhile.
- The seal (`SealFigure.vue`, in `ConfirmationPasswordPopup.vue`): a send draws the solar geometry by its stages. The
  popup learns only the outcome, so it shows the rings and the comet, then closes and ignites on acceptance, or breaks.
- The loader (`MirrorLoader.vue`, behind `Loader` and `Loading`): three comets on the mirror's rim, or the rim filling to
  a known share.
- The value tick (`valueTick.ts`): a row's fiat value or the total that changes on screen draws a line under itself in
  the colour of its direction.
- The balance card's marks (`PortfolioHero.vue`): corner brackets, ticks at the yamato divisions, an asanoha lattice a
  band of light crosses every 9 s.
- Dialogs (`Popup.vue`) arrive from a little depth.
Reduced motion and Reduced paint show every state without moving; Lite drops the band of light.
