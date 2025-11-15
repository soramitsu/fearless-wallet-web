# Runtime Hardening (P0) Kickoff

Kickoff date: 2024-09-12  
Point of contact: Runtime Core (Maria Petrova), Platform DX (Kenji Yamamoto)

## Objectives

- Seal TON balance regressions before the Runtime Parity sprint (target 2024-10-18).
- Eliminate inconsistent cache writes that lead to stale UI balances.

## Workstream Tracker

| Task                                                              | Owner          | Status               | Next Action                                          | ETA        |
| ----------------------------------------------------------------- | -------------- | -------------------- | ---------------------------------------------------- | ---------- |
| Backfill TON balance/jetton tests & error handling (`TonBalance`) | Maria Petrova  | Completed 2024-09-16 | Monitor nightly coverage run and triage failures     | 2024-09-16 |
| Consolidate balance cache publishing/stores (`BalanceService`)    | Alexei Sidorov | Completed 2024-09-16 | Track storage flush metrics in next runtime stand-up | 2024-09-16 |

## Immediate Follow-ups

1. Schedule pairing session (Maria ↔ Alexei) to validate shared caching utility (target: 2024-09-13).
2. Add `TonBalance` regression case to nightly suite once CI updates land (owner: Maria, due 2024-09-19).
3. Share storage flush rollout status in Monday runtime stand-up and flag blockers to Runtime Parity sprint leads.
4. Run a manual staking UX smoke test (Polkadot + another staking-capable chain) to confirm history labels and translations render as expected after the metadata sync changes (`docs/testing/staking-smoke-checklist.md`) — **Pending manual execution**.
