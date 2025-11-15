# Staking Smoke Test Checklist

Use this quick walk-through to validate staking UX after metadata sync or network map updates.

## Preconditions

- Wallet has at least one Substrate staking network (e.g., Polkadot) funded and visible in the network list.
- Wallet has a second staking-capable chain (e.g., Westend, Kusama, or another chain exposing `externalApi.staking`).
- Latest staking parameters fetched (automatically triggered after the sync changes; optionally manual via `Refresh` button if exposed).

## Polkadot Flow

1. Open `Staking → My Stake` for Polkadot.
2. Confirm the “About” tab shows populated metrics:
   - `Active Stake`, `Rewarded`, `Unstaking`, `Redeemable`.
   - Validators, alerts, and controller/payee fields match the on-chain state.
3. Switch to the “History” tab and verify:
   - Entries appear with human labels (e.g., `incoming`, `reward`), not just raw method strings.
   - Amounts include sign (+/-) and fiat equivalents.
   - Opening an entry surfaces the detailed dialog without errors.

## Secondary Network Flow (e.g., Westend)

1. Select the network and repeat the “About” tab inspection.
2. Validate history entries render using the same formatting rules.
3. Ensure reward entries reference the correct rewarded asset (not the primary staking asset if they differ).

## Regression Notes

- If a staking network fails to appear, confirm it publishes `externalApi.staking` metadata and retry `Sync Networks`.
- For missing labels, check `locales/*/translation.json` under `history.*`; add translations before shipping.
- Capture screenshots and console logs for any discrepancies and share with the runtime squad.
- When preparing a release, complete the tasks listed in `docs/release-checklist.md` alongside this smoke pass.
