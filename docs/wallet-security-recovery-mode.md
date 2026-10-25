# Wallet security recovery mode

The browser extension treats local secret-bearing wallets from before this security update as recovery-only, including wallets already enrolled in the universal wallet format. Updating metadata, renaming an account, or changing its password does not rotate its keys.

## Detection and new accounts

Normal use requires `walletSecurityGeneration` to equal `CURRENT_WALLET_SECURITY_GENERATION`. Only the background keyring can issue this marker, after generating a fresh recovery phrase. The background tracks a bounded set of phrase fingerprints in memory; neither the phrases nor the fingerprints are persisted by this registry. A create flow interrupted by a background restart must generate and back up another phrase before saving.

Mnemonic and JSON imports do not establish fresh-key provenance. Imported security markers and hardware/watch-only claims are discarded, so imported secret-bearing accounts remain recovery-only. This also applies to a genuine new-wallet backup restored on another installation: its generation cannot be independently verified. External, hardware, mobile, and watch-only accounts are exempt because their keys were not generated or held by this local keyring.

## User experience

Only the selected wallet decides whether a warning appears. While an affected wallet (an older or imported one) is selected, its portfolio shows a security dialog that explains how to create a fresh wallet, back up its phrase, and send funds on matching networks. A newly created wallet shows neither the dialog nor the banner, even while older wallets remain stored.

The dialog opens once for each affected wallet. Closing it, or starting wallet creation from it, is remembered on that device for every affected wallet then stored, so it does not return each time the extension opens; a key imported later gets the dialog once. The closure never upgrades a wallet: a persistent banner stays on the pages of every affected wallet and reopens the guidance.

The create action uses the existing wallet-creation flow. No account is deleted and no funds are moved automatically. Standalone EVM accounts and TON accounts remain in the account subscription and security classification; linked EVM children are represented by their parent wallet. Standalone EVM accounts are excluded from the wallet selector because the current-account, portfolio, and Send flows do not support them as wallet roots. Linked EVM accounts are selected through their parent wallet.

## Enforcement and limitations

Affected wallets retain portfolio viewing, direct token/NFT sends, backup exports, account management, settings, and the DeFi screens needed to exit existing positions. Route guards and account-switch handling enforce the UI policy; background handlers independently allow only specific recovery transactions for the actual signer. A newly generated wallet can use normal features even while old wallets remain stored.

| Feature | Recovery actions allowed | Normal actions blocked |
| --- | --- | --- |
| Staking | Unbond, redeem unlocked funds, claim rewards | Bond, add stake, rebond, nominate, change controller or payee |
| Liquidity pools | Remove existing liquidity | Add liquidity |
| Demeter | Withdraw existing deposits, claim rewards | Deposit |
| Polkamarkt | Sell owned outcome shares, claim payouts and creator fees | Buy shares |

Recovery staking claims use a transferable reward destination. When the selected account controls the staking ledger, the payout atomically sets the payee to the stash's free balance. A stash with a separate controller can claim directly to an existing noncompounding destination; a restaking destination requires selecting its controller wallet. Missing or nonpayable destinations produce an actionable error before confirmation. The fee estimate follows the same destination policy. Zero-stake networks remain reachable to check for unclaimed rewards.

Selling market shares is an exit from an existing position; backend ownership checks prevent selling more than the account owns. Generic swaps, cross-chain operations, receive flows, and dApp authorization/signing remain blocked. Unknown action types never qualify as recovery.

Existing runtime support, risk acknowledgements, fee checks, network transfer gates and on-chain withdrawal/unbonding periods still apply. No recovery operation is submitted automatically.

## Validation

Unit coverage includes pre-update and imported metadata, late account subscriptions, reopening the extension, account switching, dismissed notices, route restrictions, direct recovery transfers, signing restrictions, and signer changes during asynchronous operations. The popup is checked in a real browser at the extension size and a narrow viewport, including English, Russian, keyboard dismissal, and focus restoration.
