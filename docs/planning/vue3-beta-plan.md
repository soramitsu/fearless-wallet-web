# Vue 3 Beta Cut — Plan

Updated: 2024-10-07  
Owners: Michael Takemiya & Alexei Sidorov

## Goal

Produce a feature-complete Vue 3 branch with Pinia stores, smoke-tested critical screens, and refreshed design tokens ready for stakeholder review by **2024-11-04 (Sprint 47 kickoff)**.

## Scope Checklist

| Track                | Description                                                                                         | Status                             |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Feature completeness | Ensure all Vue 2 regressions resolved: Wallet, Swap, Pools, Staking, Settings, WalletConnect flows. | In progress                        |
| Pinia stability      | Pinia stores hydrated for new/existing users; verify persistence & devtools integration.            | In progress                        |
| Design tokens        | Updated Soramitsu UI tokens + app-specific SCSS adjustments.                                        | Done (monitor for upstream tweaks) |
| Smoke tests          | Manual + automated smoke across top screens; cypress/E2E follow-up scheduled.                       | Pending                            |
| Release artifacts    | Extension builds (Chrome MV3, Firefox MV2) + web build ready for stakeholder review.                | Pending                            |

## Timeline

- **Oct 07–25 (Sprint 44/45)**: Close outstanding Vue 2 > Vue 3 regressions, finish Pinia store QA.
- **Oct 28–Nov 01 (Sprint 46)**: Run smoke tests, verify builds, collect stakeholder feedback list.
- **Nov 04 (Sprint 47 day 1)**: Deliver beta branch for review + demo to stakeholders.

## Verification Tasks

1. Automated:
   - `yarn format:check`
   - `yarn lint:ci`
   - `yarn test:unit`
   - `yarn build:extension:all`
2. Manual:
   - Execute `docs/testing/vue3-beta-qa-checklist.md` (covers extension + web smoke, Pinia hydration, and design tokens).
   - Extension popup: onboarding, wallet connect, swap, staking, pools.
   - Web build regression across `/wallet`, `/swap`, `/staking`, `/settings`.
   - Theme/design token spot-checks (light/dark if applicable).
3. Stakeholder review:
   - Prepare demo checklist + gather sign-off notes for Sprint 47 review.

## QA Run Log

| Run | Focus                                                                                                               | Owner(s)                   | Status                                                               | Notes                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Execute `docs/testing/vue3-beta-qa-checklist.md` on Chrome MV3 + Firefox MV2 builds; capture web build observations | QA Guild, Michael Takemiya | Completed 2024-10-09 (`docs/testing/vue3-beta-qa-run-2024-10-09.md`) | All sections passed; tooltip flicker (`VUE3BETA-12`, P3) fixed + rechecked 2024-10-10. |

## Risks

| Risk                            | Impact                      | Mitigation                                                                                    |
| ------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| Late regression discovery       | Beta cut slips              | Prioritize smoke suite completion by Oct 25.                                                  |
| Soramitsu UI updates            | Visual drift                | Pin version during beta, plan for patch releases post-review.                                 |
| Devtools/Pinia persistence bugs | Blocker for beta validation | Keep QA focused on store hydration scenarios; add telemetry/logging around Pinia rehydration. |

## Action Items

1. [ ] Track outstanding regressions in Jira board (tag `vue3-beta`).
2. [ ] Execute smoke suite & document results (target Oct 30).
3. [ ] Prepare demo deck / changelog for stakeholder review (target Nov 1).
4. [ ] Tag beta branch + notify stakeholders via release notes on Nov 4.
