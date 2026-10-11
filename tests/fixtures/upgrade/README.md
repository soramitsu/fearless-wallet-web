# chrome.storage.local written by released builds

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
N = 32768 (the only cost 3.0.x libraries accept; this branch writes N = 131072),
TON seeds are CryptoJS-encrypted as 3.0.5's `TonKeyring.encodeMnemonic` wrote
them, and account metadata carries none of the fields this branch adds. The
tests open the stored keys with the recorded passwords.
