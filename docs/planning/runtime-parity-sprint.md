# Runtime Parity Sprint — Execution Plan

Updated: 2024-10-07  
Owner: Runtime Core (Maria Petrova)

_Status update (2024-10-07): Coding kicked off across balance, pools, staking, and telemetry tracks; see timeline for the Sprint 44 checkpoints._

## Objective

Deliver unified balance, pools, and staking services with background-driven metadata and regression coverage across Substrate, EVM, and TON flows by **2024-10-18 (Sprint 45 demo)**.

## Deliverables

| Track            | Description                                                                                                                                      | Owners        | Status                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------- |
| Balance parity   | Finalize shared lookup registry usage across Substrate/EVM/TON, add TON polling throttles (Phase 1 from `docs/planning/ton-balance-polling.md`). | Maria, Alexei | In progress               |
| Pools metadata   | Ensure background pools service publishes full metadata to Pinia store; cover add/remove flows in unit + smoke tests.                            | Daria         | Ready for QA              |
| Staking parity   | Validate Sora/Equilibrium staking metadata, APY analytics, and history integration; execute `docs/testing/staking-smoke-checklist.md`.           | Daria, QA     | QA passed (Oct 10)        |
| TON telemetry    | Record balance fetch/stream events for observability; align with shared telemetry plan.                                                          | Kenji         | Pending shared dispatcher |
| Regression suite | Run `yarn format:check`, `yarn lint:ci`, `yarn test:unit`, targeted E2E smoke (staking, pools, swaps), and extension build.                      | QA            | Scheduled Sprint 45 Wed   |

## Timeline

- **Oct 07 (Sprint 44 kickoff)**: Runtime parity coding start; owners confirmed deliverables, Ton balance TTL/cron work, and telemetry backlog.
- **Oct 07 EOD (Sprint 44)**: Ton TTL + cron refresh patch drafted and sent for review; telemetry event schema stubbed; QA confirmed regression matrix + checklists.
- **Oct 08 (Sprint 44)**: Ton TTL + cron refresh merged to `develop` (runtime-ttl-cron PR); telemetry event schema signed off; staking smoke checklist unblocked after APY analytics validation; Oct 10 smoke run scheduled (`docs/testing/staking-smoke-run-2024-10-10.md`).
- **Oct 10 (Sprint 44)**: Staking smoke run executed (Polkadot + Westend) — all checks green; rounding nit `RNTM-221` resolved same day via enhanced staking history formatter (`docs/testing/staking-smoke-run-2024-10-10.md`).
- **Oct 07–11 (Sprint 44)**: Wrap coding for balance throttles + telemetry prep, update docs.
- **Oct 14–16 (Sprint 45)**: QA regression + manual smoke (staking checklist, pools flows); regression run logistics captured in `docs/testing/runtime-regression-run-2024-10-16.md`.
- **Oct 18**: Demo + sign-off; publish results to release notes.

## Risks & Mitigations

| Risk                           | Impact                               | Mitigation                                                                                        |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| TON throttling slips           | Continued balance spikes during demo | Ship TTL + cron first (already scoped), event streaming can follow later.                         |
| QA bandwidth crunch            | Staking/pool smoke delayed           | Share checklist early (`docs/testing/staking-smoke-checklist.md`), prioritize automated coverage. |
| Telemetry dependency not ready | Limited observability                | Use interim console-level logging + store event payloads locally until dispatcher lands.          |

## Action Items

1. [x] Land TON balance TTL + cron refresh (target Oct 9) — merged to `develop` on 2024-10-08; monitoring TTL metrics via cron dashboard.
2. [x] Run staking smoke checklist once APY analytics settle (target Oct 11) — completed 2024-10-10 (see `docs/testing/staking-smoke-run-2024-10-10.md`); tracked rounding nit `RNTM-221` (P3).
3. [ ] QA execute regression plan (target Oct 16) — run sheet published (`docs/testing/runtime-regression-run-2024-10-16.md`); owners confirmed, awaiting execution window (includes `yarn format:check`, `yarn lint:ci`, `yarn test:unit`).
4. [ ] Demo runtime parity results in Sprint 45 Friday review.
