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

## ECDSA Substrate accounts: `s2-3.0.6-ecdsa.json` and `s3-2.6.3-ecdsa-per-account-passwords.json`

2.x (`@polkadot/ui-keyring` 3.5.1) and 3.0.x (`@subwallet/ui-keyring` 0.1.7) store an account under the account id
its address decodes to. For an ECDSA Substrate account that is the blake2 hash of the 33-byte public key; 4.2.0
(`@subwallet/ui-keyring` 0.1.14) stores the same account under the public key itself
(`src/extension/background/extension-base/src/stores/EcdsaAccountRecords.ts`). These two profiles hold such
accounts, created the way `AddWallet.vue` (`saveKeypairFromSeed`) does with ECDSA chosen under Advanced: the
Ethereum account first, then the ECDSA account that names it.

| File | Build                                  | Wallet | Phrase                  | Path      | Password                       | Keys             |
| ---- | -------------------------------------- | ------ | ----------------------- | --------- | ------------------------------ | ---------------- |
| S2   | 3.0.6 (the 3.0.5 keyring code)         | Signer | `abandon … about`       |           | master `Master password set in 3.0.6` | ECDSA + Ethereum |
|      |                                        | Spare  | `legal winner … yellow` |           | master                         | ECDSA + Ethereum |
|      |                                        | Daily  | `legal winner … yellow` | `//daily` | master                         | sr25519          |
| S3   | 2.6.3                                  | Vault  | `abandon … about`       |           | `legacy-ecdsa-A`               | ECDSA + Ethereum |
|      |                                        | Spare  | `legal winner … yellow` |           | `legacy-ecdsa-B`               | ECDSA + Ethereum |

S2 was written by the 3.0.6 hotfix build (`096485cc`: the published 3.0.5 source `129807f0` with the phrase upload
removed, same `yarn.lock`, keyring code otherwise unchanged), never by the published 3.0.5 package. Both were
captured with `harness/capture-ecdsa.mjs <2.6.3|3.0.6> <build> <scratch ext dir> <scratch profile dir> <out.json>`;
the builds carry the same throwaway manifest key as the 2.6.3 build above. `wc@2:core:0.3//keychain` (the
WalletConnect client seed the build generated) was left out of `storage`.

Used by `tests/unit/ecdsa-account-records.spec.ts` and `tests/unit/ecdsa-account-restart.spec.ts`.

### Real in-place upgrade of ECDSA accounts across browser restarts

```sh
corepack yarn build:extension          # this tree's 4.2.0 build in dist/extension/chrome
node tests/fixtures/upgrade/harness/upgrade-ecdsa.mjs 3.0.6 <3.0.6 build> dist/extension/chrome <scratch dir>
node tests/fixtures/upgrade/harness/upgrade-ecdsa.mjs 2.6.3 <2.6.3 build> dist/extension/chrome <scratch dir>
```

1. The old build writes the profile above; the 4.2.0 build replaces it under the same extension id.
2. At its first start 4.2.0 holds each ECDSA account once, under its public key, byte for byte as the old build
   wrote it, and keeps the old record unchanged under `fw:archivedAccount:<account id>`, which no keyring loads.
3. 3.0.6: unlock, rename Signer, change the master password, delete Spare. 2.6.3: create the master password, open
   Vault with its own password, delete Spare.
4. The browser restarts: the deleted wallet stays deleted and nothing of it is left where a keyring loads it (its
   records are kept under `fw:deletedWallet:`, which Settings → Account access restores from); the rename and the
   new password hold (the old password no longer unlocks); Vault is not asked for its 2.6.3 password again. The
   live record opens with the master password and signs with the key the phrase derives. It is encrypted at
   N = 2^15 and the 3.0.5 keyring (`keyring-305.mjs`) unlocks with the master password, opens it and signs with it,
   so the key 4.2.0 re-encrypted (master password change, legacy password migration) survives a rollback.
5. 3.0.6 only: Reset wallet, restart: no account record or archive is left and no account comes back.

## Rollback: keys 4.2.0 writes stay readable by 3.0.x (`keyring-3.0.5-packages.json`)

Fearless 2.x and 3.0.x open a stored key with `@polkadot/util-crypto` 12.x, which accepts only scrypt N = 2^15,
p = 1, r = 8. 14.x encrypts at N = 2^17 by default, so every key 4.2.0 encrypted (a new or imported account, a
master password change, a legacy password upgrade, recovery, a JSON export) was unreadable to a 3.0.x build. The
build now gives every key encoder 3.0.x's parameters (`scripts/keystore-scrypt-params.mjs`) and fails if any other
bundled code would encrypt at the library default. Behind that, it sets util-crypto's default cost to N = 2^15 as
well, so an encoder the call rewrite cannot see (an aliased import, another argument name) still writes what 3.0.x
reads; the build fails if util-crypto's defaults ever look different. Decoding is unchanged: N = 2^17 keys still open.

The proof uses the keyring 3.0.x shipped with, not a re-implementation: `harness/keyring-305.mjs` installs
`@subwallet/keyring` 0.1.7, `@polkadot/util-crypto` 12.6.2 and the rest of what 3.0.x loads to open a key from the
Yarn cache archives the 3.0.5 `yarn.lock` pins. `keyring-3.0.5-packages.json` lists them with that lockfile's
checksums (regenerate with `node tests/fixtures/upgrade/harness/pin-keyring-305.mjs <3.0.5 or 3.0.6 checkout>`).
Nothing is downloaded; if the archives are missing, install a 3.0.5 checkout once with
`corepack yarn@3.4.1 install --immutable`.

`tests/unit/keystore-scrypt-rollback.spec.ts` re-encrypts the keys of S1 and S2 the way 4.2.0 does and opens them
in that keyring (master password from a 4.2.0 bcrypt hash, per-account password, JSON export, batch export). It
fails without the rewrite. On CI without the archives this part is skipped; everywhere else it runs.

### Real rollback rehearsal: 3.0.6 → 4.2.0 → 3.0.6 → 4.2.0

```sh
corepack yarn build:extension          # this tree's 4.2.0 build in dist/extension/chrome
node tests/fixtures/upgrade/harness/rollback-306.mjs <3.0.6 build> dist/extension/chrome <scratch dir>
```

1. 3.0.6 writes the S2 wallets and imports a TON wallet.
2. 4.2.0 replaces it: unlock, create a wallet and a TON wallet, import the 2.6.3 Staking JSON file, export Daily as
   JSON, change the master password.
3. Outside the browser, every stored key is at N = 2^15 and opens in the 3.0.5 keyring with the new master password.
4. 3.0.6 replaces 4.2.0 under the same extension id: it unlocks with the password set in 4.2.0, lists every wallet,
   exports every key (each signs for its account) and every stored phrase, TON included.
5. 4.2.0 comes back and holds each wallet once.

The 3.0.6 build is the one the S2 capture uses (`096485cc`, never the published 3.0.5 package). With the build
before this change (`eb484759`) 16 of the checks fail: 3.0.6 still unlocks but cannot open any key.

## `chrome.storage.local` dumps: `*.storage.json`

Each `*.storage.json` file is the `chrome.storage.local` content a released
extension build left in a Chrome profile, for tests that start an upgrade from
data the shipped code wrote (addendum U0.6). Nothing in `storage` was written by
this branch's code.

| File | Build | Scenario |
| --- | --- | --- |
| `chrome-3.0.5-master-password.storage.json` | 3.0.5 | Master password; sr25519 account with a linked EVM account; TON wallet from a native TON phrase; TON wallet from a BIP39 phrase |
| `chrome-3.0.5-password-changed.storage.json` | 3.0.5 | The same, after the master password was changed inside 3.0.5 |
| `chrome-2.6.3-account-passwords.storage.json` | 2.6.3 | sr25519 account with a linked EVM account, each under its own account password; no master password |

How they were made (2026-10-10, WK-9 lane):

- The release commits were built unpacked with a test manifest key
  (extension ID `plnlnnlkcnkiokjgpefakfhgngpbnaec`, not the store ID) and run in
  Chrome for Testing 147 with no real secrets. The wallets were created through
  the build's own screens with the synthetic phrases and passwords recorded in
  each file's `provenance`. Never fund them.
- The profile's extension-settings LevelDB log was replayed in write order and
  cut at the last write the released build made (`lastLegacyWriteSequence`).
  The WalletConnect keychain record is left out (`omittedKeys`); it holds no
  wallet key.
- The 3.0.5 profiles come from commit `600a64d5` (`origin/stage`). The Chrome
  Web Store package was built from `129807f0` (`origin/master`); the keyring and
  storage code is the same in both, and `129807f0` adds only the phrase upload
  (`fetchJettonInfo`, the unlock-time call and the secret-returning
  `getDataAccounts`), which writes `myAddresses` and nothing else. No build that
  can upload a phrase was run to make these files.

What the files themselves show: every account record is scrypt-encrypted with
N = 32768 (the only cost 3.0.x libraries accept; 4.2.0 writes at that cost too, see "Rollback" above),
TON seeds are CryptoJS-encrypted as 3.0.5's `TonKeyring.encodeMnemonic` wrote
them, and account metadata carries none of the fields this branch adds. The
tests open the stored keys with the recorded passwords.
