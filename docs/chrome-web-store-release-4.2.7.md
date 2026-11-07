# Chrome Web Store release 4.2.7

This update follows 4.2.6 for the existing Fearless Wallet Store item
`nhlnehondigmgckngjomcpcefcdplmgc`. 4.2.6 was submitted for review on 4 November 2026
and carries everything in `docs/chrome-web-store-release-4.2.6.md`. 4.2.7 adds the
fixes from the 7 November 2026 review of where keys could leave the Chrome app,
including through its libraries.

## Changes

### Key export

- An unlocked wallet no longer hands out secrets without the password. Before, any
  script running in a wallet page, or anyone with DevTools on an unlocked browser,
  could read the master password (`pri(keyring.getPassword)`), export a recovery
  phrase with the password left out, export an EVM private key with any password, or
  have an EVM key re-encrypted under a password of its choosing. Every export now
  needs the session's own password, and no message returns the master password. The
  background signers are unchanged.
- The Google Drive backup of a wallet being created is written under the master
  password in the background (`pri(accounts.export.backup)`); the page never sees the
  password.

### Passwords

- A new or changed master password needs 8 characters of at least two kinds, or 12 of
  one kind (it was 6 of any kind). It protects the keys on the device and the Google
  Drive backups against offline guessing. A password set by an earlier version keeps
  working.

### Libraries beside the keys

- The Cardano libraries `@subwallet/keyring` imports (about 3 MB of WebAssembly and
  its glue, loaded at every start, for an account type Fearless does not have) are
  replaced by fail-closed stubs. The keyring still loads, and every other address
  type decodes as before.
- crypto-js, no longer maintained, is gone from the wallet: the 3.0.1-3.0.5 TON phrase
  format and the SORA cosigner envelopes are read with `@noble/hashes` and
  `@noble/ciphers`, checked against crypto-js 4.2.0 itself.
- `@subwallet/keyring` is pinned to 0.1.14.
- Dependency install scripts no longer run, and Yarn does not resolve a version less
  than 7 days old (`.yarnrc.yml`).
- The upload signer asks for the owner's Touch ID or login password before it signs a
  package (`docs/verified-crx-uploads.md`).

### Smaller

- A copied recovery phrase, raw seed or private key is cleared from the clipboard
  after a minute, when its screen closes, or the next time the wallet opens.
- The Google Drive access token no longer appears in a tab URL; the tab gets a
  short-lived handle.
- Tooltips are text. A SORA validator's self-written identity can no longer add markup
  to the wallet's page.
- `page.js` carries only the version, not the whole `package.json`.

## Not in this release

- Found in the review, not changed:
  - The encrypted vault stays in `chrome.storage.local`, which Chrome also lets
    content scripts read. Moving it is a storage migration of its own.
  - Deleted and reset wallets stay on the device under the password they had. This
    is the "never lose keys" rule.
  - Connected sites decrypt SORA multisig envelopes addressed to their account
    without a prompt, as in 3.0.6 (AUDIT-01). This reveals message contents, not keys.
  - The extension CSP allows `frame-src https:` and `frame-ancestors https:`. No page
    uses frames and no page is web-accessible.
  - `@subwallet/keyring` bundles TON's HTTP client.
  - The scrypt cost of the vault and the backups (N = 2^15) is unchanged.

## Store release note

Security update: exporting a recovery phrase or key always asks for your password,
new passwords must be stronger, and copied phrases are cleared from the clipboard.

## Validation and publication

Qualify the committed source with Node 24.19.0 / Yarn 4.17.0 and the complete local
release checks (`prepare:chrome-release`). The checks cover:

- reproducible production builds and package audits;
- historical upgrade tests;
- exact-package upgrades from 4.2.5 (live on the Store) and from the 4.2.6 upload;
- both toolbar surfaces in Chrome;
- `scripts/security-session-extension-smoke.mjs` on the release package.

The release checks need Bitcoin testnet broadcast evidence no older than 7 days. Keep
source commits, commands, results, artifact hashes, signed upload verification and
submission evidence under `output/chrome-release-4.2.7/`.

Sign with the Keychain upload signer, rebuilt from `scripts/chrome-upload-keychain.swift`
so that it asks the owner. Submit for review with automatic publication once 4.2.6 is
live, so that 4.2.6's review is not restarted. Report submission, Google's approval and
public availability separately. Hosted CI is not a release prerequisite.

The owner asked on 7 November 2026 for the review's findings to be fixed.
