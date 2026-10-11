# Upgrade fixtures written by shipped builds

Upgrade tests start from data that a released Fearless Wallet build wrote itself, never from records the
current code produced (addendum invariant U0.6). The fixtures here are `chrome.storage.local` dumps taken from
a real released build running in Chrome for Testing, with public test phrases and passwords only.

## `s1-2.6.3-per-account-passwords.json`

Fearless Wallet 2.6.3 predates the master password: every account is encrypted with its own password. The
profile holds three wallets, created the way `AddWallet.vue` (`saveKeypairFromSeed`) did in 2.6.3, the
Ethereum account first and then the Substrate account that names it, both with the wallet's password:

| Wallet    | Phrase                         | Path       | Password      | Keys                  |
| --------- | ------------------------------ | ---------- | ------------- | --------------------- |
| Savings   | `abandon … about`              |            | `legacy-pw-A` | sr25519 + Ethereum    |
| Forgotten | `legal winner … yellow`        |            | `legacy-pw-B` | sr25519 + Ethereum    |
| Staking   | `abandon … about`              | `//staking` | `legacy-pw-C` | sr25519 only          |

`provenance` in the file records the source commit, lockfile hash, toolchain and browser. Only
`wc@2:core:0.3//keychain` (WalletConnect's empty keychain) was left out of `storage`.

Used by `tests/unit/legacy-263-skip-upgrade.spec.ts` and `tests/unit/migrate-export-json.spec.ts`.

### Building 2.6.3 and capturing the profile

1. Check out the 2.6.3 source in its own worktree: `git worktree add <dir> 1d515acf` (tag commit `2.6.3 (#974)`).
2. In that worktree, with Node 20: `corepack yarn@3.4.1 install --immutable`, then `yarn build:extension`.
3. Give the built `dist/extension/chrome/manifest.json` a `"key"` from a throwaway RSA key, so the extension id
   stays the same when a newer build replaces it (the Web Store keeps the id the same way). The fixture was
   captured as `plnlnnlkcnkiokjgpefakfhgngpbnaec`.
4. `node tests/fixtures/upgrade/harness/capture-263.mjs <2.6.3 build> <scratch ext dir> <scratch profile dir> <out.json>`

The harness starts Chrome for Testing headless with every host name unresolvable (`CHROME_BIN` overrides the
default Playwright path), drives the background through the popup's own port, and dumps storage from the
service worker.

## Real in-place upgrade: 2.6.3 → 4.2.0 with one forgotten password

`harness/upgrade-263-skip.mjs` replays the whole upgrade in the browser with the real builds, as a user who
remembers one wallet's password and not the other two:

```sh
corepack yarn build:extension          # this tree's 4.2.0 build in dist/extension/chrome
node tests/fixtures/upgrade/harness/upgrade-263-skip.mjs <2.6.3 build> dist/extension/chrome <scratch dir>
```

1. The 2.6.3 build writes the profile above.
2. The 4.2.0 build replaces it under the same extension id and is reloaded from `chrome://extensions`, which
   starts the new service worker and fires `runtime.onInstalled` with reason `update`, as a store update does.
3. In the popup: the prompt opens; "Later" is not offered before a master password exists; Start → create the
   master password → the password rows → select Savings, type `legacy-pw-A`, Confirm → Skip for now → confirm.
4. The wallet opens with the Account access reminder. The prompt is deferred; the three skipped keys are listed
   in Account access; their records are byte for byte what 2.6.3 wrote.
5. The browser restarts: Unlock leads to the wallet, not back to the prompt; the password rows stay reachable.
6. Account access unlocks Forgotten and its Ethereum account with the recovery phrase; Staking, which needs its
   derivation path, keeps waiting and its record stays untouched.
7. Outside the browser, every record 4.2.0 rewrote opens with the master password and signs with the key the
   2.6.3 phrase derives.

The script prints one line per check and writes `report.json` into the scratch directory; it exits non-zero on
the first failed check. It never reaches a network and uses public test phrases only.
