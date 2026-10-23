# Portfolio dashboard (phase P0)

A winged-sun hero over the portfolio, an **All wallets** scope and a calm, honest sync state. It is behind a build
flag and **cannot reach a production build**. Design spec, renders and the prototype live outside this repository
(`design/portfolio-dashboard/` in the workspace); this page records what the extension implements and how to check it.

## Turning it on

The dashboard exists only in development and test builds, and only when asked for:

```bash
VUE_APP_PORTFOLIO_DASHBOARD=true yarn build-watch:extension
VUE_APP_PORTFOLIO_DASHBOARD=true yarn build:extension-test
```

The decision is made once, in `portfolioDashboardBuildFlag` (`vite.config.shared.mjs`): on only when
`VUE_APP_PORTFOLIO_DASHBOARD` is `true` **and** the bundler's mode is not `production` (`NODE_ENV` is no use here, the
build sets it to `production` for every mode). It reaches the bundle as the literal `process.env.FW_PORTFOLIO_DASHBOARD`,
so a build without the dashboard ships none of its code, strings, styles or artwork. The variable is not in
`PRODUCTION_RELEASE_FLAGS`, so release audit metadata is unchanged, and `tests/unit/portfolio-dashboard-flag.spec.ts`
covers the rule. Two rules in `src/portfolio/dashboard/dashboardFlag.ts` keep the dashboard out of a release: a dynamic
`import()` of a dashboard screen is guarded by the literal test written in place, and everything else may test
`PORTFOLIO_DASHBOARD_ENABLED`. The background answers the new message only in a build that carries the dashboard.

Check a production build with the flag asked for anyway; it must carry nothing:

```bash
VUE_APP_PORTFOLIO_DASHBOARD=true yarn build:extension
yarn audit:portfolio-dashboard-absent
```

## What P0 contains

| Piece | Where |
|---|---|
| Hero: total, 24 h change, what is not included, how we count, sync chip, legend, Swap with the Polkaswap mark | `src/screens/portfolio/PortfolioHero.vue` |
| Winged sun in four depth layers plus the 100-ray allocation fan (static: no parallax yet) | `PortfolioSky.vue`, `src/assets/brand/portfolio-sun/` |
| All wallets scope: Tokens, Networks and Wallets lenses, read only, every holding names its wallet | `PortfolioAllWallets.vue` |
| All wallets row in the wallet picker; the header names it on the portfolio | `PortfolioScopeRow.vue`, `SelectWalletPopup.vue`, `Header.vue` |
| How we count and balance status sheets | `PortfolioCountingSheet.vue`, `PortfolioSyncSheet.vue`, `PortfolioSheet.vue` |
| Wiring: the hero replaces the plain total, and the screen scrolls as one | `src/screens/wallet&asset/wallet/Wallet.vue` |

With one wallet nothing changes except the hero: the header total, the list and its lenses are the existing ones.
All wallets exists only with two or more wallets and is their default scope; the last choice is remembered.

Not in P0 (later phases of the spec): Where it lives, readiness chips, the route card and the Move and Swap sheets (P1);
parallax and the sheen (P2); privacy mode, Send, Receive, Buy and Move quick actions (the extension has no flow for
them that does not start from an asset), in transit, and expanding a wallet row.

## Numbers

The portfolio contract is unchanged: amount is free plus reserved, fiat is the amount times the asset's own trusted
price, the total counts visible, non-testnet, priced assets, and hidden, unpriced, unloaded and pool-stake value is named.

- **One wallet:** the hero shows the same summary the header always has (`usePortfolio().summary`).
- **All wallets:** the sum of every wallet's own total, each computed with that wallet's hidden assets, with the
  exclusions summed and named. The change is the summed change over the summed value a day ago, not an average.
- **The fan and legend** group by the lens: Tokens (approved groups only, never symbols or price ids), Networks or
  Wallets. Every lens is built from the same counted holdings, so they add up to the same total.
- **Colour follows the entity.** Five chart slots plus Other (`src/styles/_fw-dashboard.scss`), kept per scope and lens
  in storage so an entity keeps its slot while it stays in the top five. First launch seeds XOR, ETH, BTC, DOT and USDT.

## Data and state

- The background answers `pri(accounts.portfolioHoldings)` (`BalanceService.getPortfolioHoldings`) with every wallet's
  counted holdings, from the same balance maps, registry networks and prices as `getTotalBalances`. It is read only, and
  a build without the dashboard refuses it like any unknown message. It is also on the read-only allow-list of the web
  recovery state, next to `accounts.totalBalances`.
- The popup computes the selected wallet itself from its own stores (so it always agrees with the list below the hero)
  and reads the other wallets from the background every 5 s while All wallets is on screen and the page is visible.
- A failed read keeps the last answer and shows it as saved. Sync state: live, saved (older than 15 minutes, with the
  age), partial (a network that holds counted value failed) or offline. The age is shown only for saved balances.
- Preferences (scope, All wallets lens, chart slots) are in `localStorage` under `portfolio_dashboard-v1`, read through
  `src/portfolio/dashboard/preferences.ts`, which falls back to defaults for anything unreadable.
- Strings are in `src/portfolio/dashboard/locales.ts` (English and Russian), merged when the dashboard first mounts. They
  are not in `translation.json` yet because the Akkadian and Egyptian locales must cover every key there; both fall back
  to English for these strings until the flag graduates.

## Checking it

```bash
yarn vitest run tests/unit/portfolio-dashboard-*.spec.ts
VUE_APP_PORTFOLIO_DASHBOARD=true EXTENSION_TYPE=chrome VUE_APP_TEST_ONLY=true VUE_APP_EXTENSION_SMOKE=true \
  OUTPUT_DIR=chrome-test IS_EXTENSION=true yarn env-cmd -f .env.extension node scripts/build-extension.mjs --mode development
node scripts/solana-extension-smoke.mjs --dashboard-screenshots output/dashboard-screenshots
```

The smoke opens the real popup at 561 x 600, offline, with two wallets (the second created in the real keyring, its
holdings injected as the background would report them), checks what the screens claim and captures twelve screens
(`scripts/extension-smoke-dashboard.mjs`). It also asks the real background for `pri(accounts.portfolioHoldings)` and
checks the shape of the answer.

## Before the flag graduates

1. Move the strings into `translation.json` with Akkadian and Egyptian text.
2. Move the chart slots into `config/design/fw.tokens.json` and regenerate, with the iOS and Android parity.
3. Decide the chart slot Other: it is slate by design and sits about 14.9 from slot 5 (OKLab x 100), just under the
   floor of 15 the five hues keep among themselves; names in the legend carry identity either way.
4. Keyboard and screen-reader pass on the hero, legend, lens control and sheets; a pass at the full-tab width.
5. Decide whether All wallets should be the default scope for people with several wallets.
