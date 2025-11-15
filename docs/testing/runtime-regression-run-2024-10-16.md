# Runtime Regression Run — 2024-10-16

Updated: 2024-10-10  
Owners: QA Guild (Sasha Volkova), Runtime/Core (Michael Takemiya)

## Scope

- Execute the Sprint 45 regression checklist ahead of the Oct 18 demo:
  - `yarn format:check`
  - `yarn lint:ci`
  - `yarn test:unit`
  - Targeted Cypress smoke: staking, pools, swaps (`yarn test:e2e --spec staking, pools, swaps`).
  - `yarn build:extension:all` to confirm Chrome MV3 + Firefox MV2 outputs.
- Capture logs/artifacts, file regressions with `runtime-parity` tag, and update `docs/planning/runtime-parity-sprint.md` Action Item 3 with results.

## Schedule (UTC)

| Time        | Activity                                                     | Owner   |
| ----------- | ------------------------------------------------------------ | ------- |
| 08:30–08:40 | Environment prep (dependencies, cache clean, env vars).      | Michael |
| 08:40–08:45 | `yarn format:check`.                                         | Michael |
| 08:45–09:45 | `yarn lint:ci` + `yarn test:unit`.                           | Michael |
| 09:45–11:15 | Cypress smoke (staking, pools, swaps) on Chrome.             | Sasha   |
| 11:15–11:45 | Extension builds (`yarn build:extension:all`).               | Sasha   |
| 11:45–12:15 | Log review, artifact upload, summary to `#fearless-runtime`. | Michael |

## Environment

- Branch: `develop` @ commit captured morning of Oct 16 (tag `runtime-regression-run-2024-10-16`).
- Node/Yarn: Node 18.x (LTS), Yarn 1.x per repo `.nvmrc`.
- Cypress: headed Chrome 118; fallback to Electron if CI required.
- Ensure `FL_*` API keys present for history lookups; use QA secrets vault if running locally.

## Test Matrix & Owners

| Check             | Command / Notes                                  | Owner   |
| ----------------- | ------------------------------------------------ | ------- |
| Format            | `yarn format:check`                              | Michael |
| Lint              | `yarn lint:ci`                                   | Michael |
| Unit tests        | `yarn test:unit`                                 | Michael |
| Cypress – staking | `yarn test:e2e --spec cypress/e2e/staking.cy.ts` | Sasha   |
| Cypress – pools   | `yarn test:e2e --spec cypress/e2e/pools.cy.ts`   | Sasha   |
| Cypress – swaps   | `yarn test:e2e --spec cypress/e2e/swaps.cy.ts`   | Sasha   |
| Extension builds  | `yarn build:extension:all`                       | Sasha   |

## Result Table

| Check             | Status (Pass/Fail/Blocked) | Notes / Jira | Owner |
| ----------------- | -------------------------- | ------------ | ----- |
| Format            |                            |              |       |
| Lint              |                            |              |       |
| Unit tests        |                            |              |       |
| Cypress – staking |                            |              |       |
| Cypress – pools   |                            |              |       |
| Cypress – swaps   |                            |              |       |
| Extension builds  |                            |              |       |

## Issues & Follow-ups

- Log regressions here with severity, owner, and next action.

## Reporting

1. Update the result table.
2. Post a green/yellow/red summary + artifact links to `#fearless-runtime`.
3. Update `docs/planning/runtime-parity-sprint.md` (Action Item 3) with pass/fail status once complete.
