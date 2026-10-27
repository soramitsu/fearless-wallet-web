# Portfolio dashboard (phases P0 and P1)

A winged-sun hero over the portfolio, an **All wallets** scope and a calm, honest sync state (P0), and **Where it lives**:
for any token, where it is held across wallets and networks, how each holding stands to a swap on Polkaswap, and a hand
over to the screens the extension already has for moving, swapping, sending and receiving (P1). It **ships**: Chrome and
Firefox releases carry it from 4.2.0. Design spec, renders and the prototype live outside this repository
(`design/portfolio-dashboard/` in the workspace); this page records what the extension implements and how to check it.

## The build flag

Every build carries the dashboard. A release pins it on: `VUE_APP_PORTFOLIO_DASHBOARD` is `true` in
`PRODUCTION_RELEASE_FLAGS` (`scripts/build-extension.mjs`), the build records it in `extension-build-metadata.json`, and
the Chrome release audit requires it (`EXPECTED_RELEASE_FLAGS` in `scripts/audit-chrome-release.mjs`). Development and
test builds carry it too, so every smoke exercises what people get; `VUE_APP_PORTFOLIO_DASHBOARD=false` leaves it out of
one of those:

```bash
VUE_APP_PORTFOLIO_DASHBOARD=false yarn build-watch:extension
```

The decision is made once, in `portfolioDashboardBuildFlag` (`vite.config.shared.mjs`), and reaches the bundle as the
literal `process.env.FW_PORTFOLIO_DASHBOARD`, so a build without the dashboard ships none of its code, strings, styles or
artwork. `tests/unit/portfolio-dashboard-flag.spec.ts` covers the rule and `scripts/test-extension-build-environment.mjs`
the release pin. Two rules in `src/portfolio/dashboard/dashboardFlag.ts` keep a build without it clean: a dynamic
`import()` of a dashboard screen is guarded by the literal test written in place, and everything else may test
`PORTFOLIO_DASHBOARD_ENABLED`. The background answers the new message only in a build that carries the dashboard.

To ship a release without it, set the flag to `false` in `PRODUCTION_RELEASE_FLAGS` and `EXPECTED_RELEASE_FLAGS`, build,
and check the build carries nothing:

```bash
yarn build:extension
yarn audit:portfolio-dashboard-absent
```

Three files outside the dashboard know about it. The route table (`src/router/routes.ts`) adds the `TokenLocations`
route name and spreads in the route behind the literal flag test. `Header.vue` shows its back button on that route name.
`SwapForm.vue` has a block that reads the pair a hand-off chose, behind the same literal test.
`scripts/check-portfolio-dashboard-absent.mjs` looks for the P1 markers too.

## What P0 contains

| Piece | Where |
|---|---|
| Hero: total, 24 h change, what is not included, how we count, sync chip, legend, Swap with the Polkaswap mark | `src/screens/portfolio/PortfolioHero.vue` |
| Winged sun in four depth layers plus the 100-ray allocation fan (static: no parallax yet). The wings run off the hero card's edges: past the shoulder each wing stretches sideways until its tip runs off its own edge, and where it passes behind the text it is veiled to 35% (`--sky-veil`) | `PortfolioSky.vue`, `skyGeometry.ts`, `src/assets/brand/portfolio-sun/` |
| All wallets scope: Tokens, Networks and Wallets lenses, read only, every holding names its wallet | `PortfolioAllWallets.vue` |
| All wallets row in the wallet picker; the header names it on the portfolio | `PortfolioScopeRow.vue`, `SelectWalletPopup.vue`, `Header.vue` |
| How we count and balance status sheets | `PortfolioCountingSheet.vue`, `PortfolioSyncSheet.vue`, `PortfolioSheet.vue` |
| Wiring: the hero replaces the plain total, and the screen scrolls as one | `src/screens/wallet&asset/wallet/Wallet.vue` |

With one wallet nothing changes except the hero: the header total, the list and its lenses are the existing ones.
All wallets exists only with two or more wallets and is their default scope; the last choice is remembered.

## What P1 contains

| Piece | Where |
|---|---|
| Readiness chip on a token row, a holding and Where it lives: Swap-ready, 1 move, 2 moves, Moves paused, Swaps paused | `PortfolioReadinessChip.vue`, `readiness.ts`, `useReadiness.ts` |
| Where it lives: the token, its holdings in every wallet in scope, an orbit picture, the breakdown, the route card, the actions | `TokenLocations.vue` (route `portfolio/where`), `PortfolioOrbit.vue`, `PortfolioBreakdown.vue`, `PortfolioRouteCard.vue`, `locations.ts`, `orbit.ts`, `useTokenLocations.ts` |
| The Polkaswap card: the checks behind a swap, in words and marks | `PortfolioCheckList.vue`, `polkaswapChecks.ts` |
| Swap sheet and Move sheet | `PortfolioSwapSheet.vue`, `PortfolioMoveSheet.vue` |
| Hand-offs, the actions each holding gets, and switching wallet first | `handoff.ts`, `actions.ts`, `useWalletSwitch.ts`, and a block in `SwapForm.vue` |

**Getting there.** All wallets by token: a token with one holding opens Where it lives on a tap; a token with several
expands, and its **Where it lives** link opens it. By network: a holding opens it with that holding chosen. With one wallet
there is no list to expand, so the second pick of a legend chip or a ray opens the token. The header's back button and the
dock's Wallet tab both come back to it.

**The screen.** The orbit (the token in the middle, a satellite per network, Polkaswap at the top right, a link from each
network drawn by how it stands to a swap) is a picture for the pointer: it is hidden from assistive technology and its
satellites are out of the tab order. The holdings list under it is the accessible truth, and picking a holding (or a
satellite, which picks that network's largest holding) fills the panel: the breakdown, the route card and the actions.

**Breakdown.** Transferable, plus reserved, locked or staked, is the total counted. Each is said in words beside the bar,
and the bar is patterned, so no colour carries it alone. `PortfolioHolding` gained `transferable` for this.

## Readiness

Readiness is how a holding stands to a swap on Polkaswap (`readiness.ts`; design spec 4.5):

| State | Chip | Meaning |
|---|---|---|
| `ready` | Swap-ready | On the swap venue (SORA), and release policy has swaps on. |
| `route` | 1 move, 2 moves, 3 moves | A reviewed route brings it to SORA in at most three moves, and those moves are on. |
| `off` | Moves paused, Swaps paused | It could get there (or is there), but release policy has the moves or the swaps off. |
| `none` | no chip | No reviewed route. Where it lives says so. |
| `unknown` | no chip | The app has not loaded release policy yet, so nothing is claimed. |

It asks the app's own reviewed routes (`BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES`), only those that carry an execution
definition, and a route counts only while the live registry's catalogues still match it
(`matchesReviewedRouteCatalog`). It never assumes a route. Paused is dashed and carries its own words, so it never reads as
available. In 4.2.0 swaps are on and cross-network moves are off. Every route into SORA except Liberland's is retired
with SORA's halted parachains (`reviewedRoutes.ts`). So a token on SORA reads Swap-ready, LLD on Liberland reads Moves
paused, and DOT, KSM and USDT on Ethereum have no chip. The Ethereum to SORA route stays unavailable by design, and the
route card says so when the app's registry knows it.

## Hand-offs

Where it lives never signs, never invents a route and never fills an amount. It opens the screens the extension already
has, with what it knows already chosen:

| Action | Opens | With |
|---|---|---|
| Move | `CrossChain` | the first move's `originChainId` and `assetKey` in the route query; with two or three moves the first is started and the rest are reviewed as they come |
| Swap | `Polkaswap` | the pay asset (`from`) and the asset to receive (`to`) in the route query, never an amount |
| Send, Receive | `SendForm`, `ReceiveForm` | `assetId` and `network` in the route params, as the portfolio list opens them |
| Receive on SORA | `ReceiveForm` | the SORA asset the route's last move delivers, as the live registry names it, on the SORA network |

The Swap hand-off is read by `SwapForm.vue` (behind the flag) through `swapPairFromQuery`, which accepts only values shaped
like a registry asset id, ignores a `to` equal to `from`, and ignores anything else. An action that is not available stays
on screen, says why next to it (moves paused, swaps paused, sending off on the network, no SORA account, cannot sign, SORA
not connected, no XOR for the fee) and does nothing.

**Another wallet's holding.** Every one of those screens works on the selected wallet, so the button says "Switch to
Savings and review move" and, when pressed, asks the background to switch (`pri(accounts.update.current)`), waits up to 4 s
for the popup's own copy of the selected wallet to follow, and then waits up to 1.5 s for the app's own redirect to the
portfolio (`App.vue`, `onAccountUpdate`, on every wallet change) to land, so the hand-off is the last navigation. If the
wallet does not switch it says so and stays where it is. The checks behind a swap are known only for the selected wallet;
for another they read "Checked in Savings".

## Numbers

The portfolio contract is unchanged: amount is free plus reserved, fiat is the amount times the asset's own trusted
price, the total counts visible, non-testnet, priced assets, and hidden, unpriced, unloaded and pool-stake value is named.

- **One wallet:** the hero shows the same summary the header always has (`usePortfolio().summary`).
- **All wallets:** the sum of every wallet's own total, each computed with that wallet's hidden assets, with the
  exclusions summed and named. The change is the summed change over the summed value a day ago, not an average.
- **The fan and legend** group by the lens: Tokens (approved groups only, never symbols or price ids), Networks or
  Wallets. Every lens is built from the same counted holdings, so they add up to the same total.
- **Where it lives** is built from those same counted holdings (`buildTokenLocations`): a token is an approved group or a
  single asset, never a shared symbol, so the holdings and networks add up to the token's row and the screen's share of the
  portfolio is the token's value over the scope's total.
- **Colour follows the entity.** Five chart slots plus Other (`src/styles/_fw-dashboard.scss`), kept per scope and lens
  in storage so an entity keeps its slot while it stays in the top five. First launch seeds XOR, ETH, BTC, DOT and USDT.

## Data and state

- The background answers `pri(accounts.portfolioHoldings)` (`BalanceService.getPortfolioHoldings`) with every wallet's
  counted holdings, from the same balance maps, registry networks and prices as `getTotalBalances`. It is read only, and
  a build without the dashboard refuses it like any unknown message. It is also on the read-only allow-list of the web
  recovery state, next to `accounts.totalBalances`. Each holding carries `transferable` (what can be sent now).
- The popup computes the selected wallet itself from its own stores (so it always agrees with the list below the hero)
  and reads the other wallets from the background every 5 s while All wallets is on screen and the page is visible.
- A failed read keeps the last answer and shows it as saved. Sync state: live, saved (older than 15 minutes, with the
  age), partial (a network that holds counted value failed) or offline. The age is shown only for saved balances.
- Preferences (scope, All wallets lens, chart slots) are in `localStorage` under `portfolio_dashboard-v1`, read through
  `src/portfolio/dashboard/preferences.ts`, which falls back to defaults for anything unreadable.
- Strings are in `src/portfolio/dashboard/messages.ts` (English and Russian, as data), registered by `locales.ts` when
  the dashboard first mounts. They are not in `translation.json` yet because the Akkadian and Egyptian locales must cover
  every key there. Every locale but Russian shows these strings in English for now.

## Not in these phases

Parallax and the sheen (P2); privacy mode; a Buy quick action; value in transit; the full-tab layout; an amount in a
hand-off (the cross-chain, Polkaswap and Send screens ask for it); a longer route than three moves; a swap pair beyond the
popular SORA assets the Swap sheet offers (XOR, VAL, PSWAP, XSTUSD, from the registry, never from wallet symbols).

## Checking it

```bash
yarn vitest run tests/unit/portfolio-dashboard-*.spec.ts
NODE_ENV=production EXTENSION_TYPE=chrome VUE_APP_TEST_ONLY=true VUE_APP_EXTENSION_SMOKE=true OUTPUT_DIR=chrome-test \
  IS_EXTENSION=true yarn env-cmd -f .env.extension node scripts/build-extension.mjs --mode development
node scripts/solana-extension-smoke.mjs --dashboard-screenshots output/dashboard-screenshots
```

The unit specs cover the readiness evaluator against synthetic chains and the real snapshot, the hand-off locations, the
actions each state gets, the wallet switch, and the Where it lives screen and its sheets with only the stores, the router
and the wallet switch stood in for (`portfolio-dashboard-token-locations.spec.ts`).

The smoke opens the real popup at 561 x 600, offline, with every wallet in the keyring: the main smoke's fresh wallet
holds the fixture balances, a second wallet, Savings, is created in the real keyring with its holdings injected as the
background would report them, and the main smoke's old, imported wallet holds nothing, so the Wallets lens also shows
how an empty wallet reads. It checks what the screens claim and captures the screens listed in the README it writes
(`scripts/extension-smoke-dashboard.mjs`). The P1 flow checks the readiness chips, Where it lives for
DOT (no route, Send first), Where it lives for LLD on Liberland with its move paused, Receive on SORA, the same screen
with moves on and the Move sheet handing over to the cross-chain screen with the network and asset chosen, the dock and
the header's back button, XOR as swap-ready and the Swap
sheet handing over the pair to Polkaswap, USDT in Savings switching wallet first (the real background switches)
before Send opens, the single-wallet legend, and Where it lives in Russian. It also asks the real background for
`pri(accounts.portfolioHoldings)` and checks the shape of the answer.

Build the test extension with `NODE_ENV=production`, as release preparation does. The fixture is the production
registry, and the popup takes SORA's network name and asset ids from `NODE_ENV` at build time (`src/consts/sora.ts`), so
without it XOR on SORA Mainnet is not swap-ready and the smoke stops at the readiness chips, saying to rebuild.

On Node 26 (newer than the one `.nvmrc` pins), run the unit tests with `NODE_OPTIONS=--no-experimental-webstorage`.
Without it Node's own experimental `localStorage` shadows the test environment's, and 45 tests in six files
(`visual-effects*`, `web-password-store`, `export-form-access-errors`, `json-backup-export-options`) fail on any commit.

## Still to do

1. Move the strings into `translation.json` with Akkadian and Egyptian text, and translate them for the other locales.
2. Move the chart slots into `config/design/fw.tokens.json` and regenerate, with the iOS and Android parity.
3. Decide the chart slot Other: it is slate by design and sits about 14.9 from slot 5 (OKLab x 100), just under the
   floor of 15 the five hues keep among themselves; names in the legend carry identity either way.
4. Keyboard and screen-reader pass on the hero, legend, lens control, sheets, Where it lives and its actions; a pass at the
   full-tab width.
5. Decide whether All wallets should be the default scope for people with several wallets.
6. Readiness reads this extension's bundled reviewed routes. iOS and Android list different routes today, so the same chips
   there need an evaluator over their own registry; the screens' words and states are the shared part.
7. The `SwapForm.vue` block that reads the hand-off's pair is flag-gated: once a release without the dashboard is no
   longer wanted, make it unconditional, with its own test in the swap form's spec.
8. Replace the dock and back-button workarounds if the router's per-primary history changes (`router.back` pops the current
   primary destination's own stack, so Where it lives is reached again through the Wallet tab).
