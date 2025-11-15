# Vue 3 Beta QA Run — 2024-10-09

Updated: 2024-10-09  
Owners: Michael Takemiya (Runtime/Web), QA Guild Leads (Sasha Volkova, Kenji Yamamoto)

_Status: Completed — executed 2024-10-09 09:00–12:20 UTC; see results below._

## Scope

- Execute every item in `docs/testing/vue3-beta-qa-checklist.md` across Chrome MV3 + Firefox MV2 extension builds and the standalone web build.
- Emphasize Pinia hydration/persistence, staking and pools parity checks, and Soramitsu design token alignment.
- Capture logs, screenshots, and repro steps for regressions; tag Jira issues with `vue3-beta`.

## Schedule (UTC)

| Time        | Activity                                                               | Owner          |
| ----------- | ---------------------------------------------------------------------- | -------------- |
| 09:00–09:15 | Environment setup (extensions load, wallets restored, funding checks). | Kenji          |
| 09:15–10:30 | Extension core flows (onboarding, wallet, swap, pools, staking).       | Sasha          |
| 10:30–11:00 | Settings + WalletConnect flows.                                        | Michael        |
| 11:00–11:30 | Web build regression + responsive checks.                              | QA rotation    |
| 11:30–12:00 | Pinia hydration/devtools validation + log review.                      | Michael        |
| 12:00–12:30 | Bug triage + summary posted to `#fearless-web-qa`.                     | Michael, Sasha |

## Test Environment

- Builds: `yarn build:extension:all` (Chrome MV3 + Firefox MV2) and `yarn build:web` artifacts from `develop` @ commit `runtime-ttl-cron-merge` (Oct 08).
- Profiles: Fresh Chrome/Firefox profiles with previous Vuex data cleared; two funded wallets (Substrate + EVM) plus pools/staking positions.
- Feature flags: default production configuration; telemetry console logging enabled.

### Pre-run Checklist

- [x] Chrome MV3 + Firefox MV2 packages installed locally.
- [x] Web build served via `yarn serve:dist` dry-run.
- [x] Wallets restored and balances validated (Substrate/EVM + pools/staking).
- [x] Vue Devtools beta channel installed.
- [x] Soramitsu token references exported for visual comparison.

## Assignments

| Checklist Section                    | Owner(s)                   | Notes                                                                              |
| ------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| Extension – Onboarding & Wallet      | Sasha                      | Capture screenshots of balances vs. Vue 2 reference.                               |
| Extension – Swap & Pools             | Sasha                      | Run both success + cancel cases.                                                   |
| Extension – Staking                  | Daria (runtime), QA assist | Reuse `docs/testing/staking-smoke-checklist.md`.                                   |
| Extension – Settings & WalletConnect | Michael                    | Validate persistence + WC staging dapp handshake.                                  |
| Web App Regression                   | QA rotation                | Cover `/wallet`, `/swap`, `/staking`, `/settings` on desktop/tablet/mobile widths. |
| Pinia Hydration & Devtools           | Michael                    | Record any warnings; attach timelines if time-travel fails.                        |
| Design Tokens & Theming              | Kenji                      | Compare against Soramitsu reference tokens.                                        |
| Release Artifacts & Logging          | Michael                    | Ensure manifests show version `3.x`; archive logs.                                 |

## Results

| Area                        | Status (Pass/Fail/Blocked) | Notes / Jira Links                                                                              | Owner       |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| Onboarding                  | Pass                       | Import + new mnemonic flows succeed on Chrome/Firefox; no console errors.                       | Sasha       |
| Wallet Balances             | Pass                       | Fiat/token pairs match Vue 2 screenshots; manual refresh updates within 5s.                     | Sasha       |
| Swap                        | Pass                       | XOR→VAL (SORA) & DOT↔KSM swaps succeed; cancel flow clears Pinia state.                        | Sasha       |
| Pools                       | Pass                       | Add/remove liquidity reflected instantly; analytics cards refresh.                              | Sasha       |
| Staking                     | Pass                       | `docs/testing/staking-smoke-checklist.md` steps green for Polkadot; history labels good.        | Daria       |
| Settings                    | Pass w/ note               | Theme/currency/language persist; dark-mode tooltip flicker logged (`VUE3BETA-12`, P3).          | Michael     |
| WalletConnect               | Pass                       | Staging dapp handshake + signature success; no background warnings.                             | Michael     |
| Web Regression              | Pass                       | `/wallet`, `/swap`, `/staking`, `/settings` load without hydration warnings across breakpoints. | QA rotation |
| Pinia Hydration             | Pass                       | Devtools shows stores; time-travel on `balances/fetch` works; unlock cycle persists data.       | Michael     |
| Design Tokens               | Pass                       | Light/dark tokens align with Soramitsu references; focus states meet contrast requirements.     | Kenji       |
| Release Artifacts & Logging | Pass                       | Extension manifests read `3.0.0-beta`; logs archived under `artifacts/2024-10-09`.              | Michael     |

## Issues & Follow-ups

- `VUE3BETA-12` (P3) — Settings tooltip focus flicker in dark mode. Resolved via tooltip target binding fix (2024-10-10); verification notes below. Owner: Alexei Sidorov.

### Post-fix verification — Settings tooltip (2024-10-10)

- Checked header settings icon hover/focus on Chrome MV3 + Firefox MV2 in dark mode after tooltip fix.
- Tooltip stays anchored without flicker; focus outline stable; no console warnings.
- Result: **Pass** (posted to `#fearless-web-qa` 2024-10-10 14:05 UTC).

## Reporting

1. Results table finalized 2024-10-09 12:15 UTC.
2. Summary posted to `#fearless-web-qa` at 12:20 UTC — status **Green**, noted `VUE3BETA-12`.
3. QA Run Log in `docs/planning/vue3-beta-plan.md` updated to “Completed 2024-10-09”.
