# Staking Smoke Run — 2024-10-10

Updated: 2024-10-10  
Owners: Daria Smirnova (Runtime), QA Guild (Sasha Volkova)

_Status: Completed — executed 2024-10-10 09:30–11:30 UTC._

## Scope

- Execute `docs/testing/staking-smoke-checklist.md` focusing on Polkadot + Westend (or another staking-capable secondary chain) after APY analytics sign-off.
- Validate history labels, metadata, and reward calculations following the runtime parity updates.
- Capture logs/screenshots for discrepancies and tag new Jira issues with `runtime-parity`.

## Schedule (UTC)

| Time        | Activity                                                | Owner        |
| ----------- | ------------------------------------------------------- | ------------ |
| 09:30–09:45 | Prep accounts (funding checks, ensure networks synced). | Daria        |
| 09:45–10:30 | Polkadot flow (About, History, dialogs).                | Daria        |
| 10:30–11:00 | Secondary network flow (Westend) + regressions.         | Sasha        |
| 11:00–11:15 | Notes + screenshot capture.                             | Daria        |
| 11:15–11:30 | Summary posted to `#fearless-runtime`.                  | Daria, Sasha |

## Environment

- Build: extension popup from `develop` commit `runtime-ttl-cron-merge` (Oct 08).
- Accounts: funded Polkadot + Westend staking wallets with recent history.
- Feature flags: default; APY analytics refreshed at 09:00 UTC via cron.

## Result Table

| Check                            | Status (Pass/Fail/Blocked) | Notes / Jira                                                                                   | Owner |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| Polkadot – About metrics         | Pass                       | Active/Rewarded/Unstaking/Redeemable align with on-chain; APY banner matches analytics feed.   | Daria |
| Polkadot – History entries       | Pass                       | Entries show human labels + +/- signs; fiat equivalents match reference logs.                  | Daria |
| Polkadot – Entry dialog          | Pass                       | Detail modal opens without errors; controller/payee data renders correctly.                    | Daria |
| Secondary – About metrics        | Pass                       | Westend metrics mirror telemetry snapshot; validator list loads within 2s.                     | Sasha |
| Secondary – History formatting   | Pass                       | Westend entries reuse same labels/fiat formatting; no raw method strings.                      | Sasha |
| Secondary – Reward asset mapping | Pass w/ note               | Rewards correctly show WND asset; noted rounding delta on <0.001 WND amounts (`RNTM-221`, P3). | Sasha |

## Issues & Follow-ups

- `RNTM-221` (P3) — Westend reward history rounds to 5dp vs. 6dp expected on very small payouts. Owner: Daria. **Resolved 2024-10-10** via enhanced `decimalTiny` formatter; re-check confirmed <0.001 WND entries now show 6 decimal places.

## Reporting

1. Result table finalized 2024-10-10 11:25 UTC.
2. Summary + screenshots posted to `#fearless-runtime` at 11:28 UTC (status **Green**, noted `RNTM-221`).
3. Action Item 2 in `docs/planning/runtime-parity-sprint.md` updated to reflect completion.
