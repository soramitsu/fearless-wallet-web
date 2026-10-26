# Chrome Web Store release 4.2.1

This security update supersedes the pending 4.2.0 submission. The developer
dashboard showed 3.0.9 published and 4.2.0 awaiting review on 26 October 2026 JST.
The existing store item is `nhlnehondigmgckngjomcpcefcdplmgc`.

## Changes

- Session expiry now locks the background keyring after 30 minutes, including
  when wallet pages remain open. Deadline checks also enforce expiry after sleep.
- Locking clears open wallet pages and cancels pending signing requests. Transfers
  waiting for network responses cannot use captured signing keys after lock,
  re-unlock, or a password change.
- New and changed passwords use bcrypt cost 12. A successful unlock upgrades an
  older desktop verifier atomically without changing account ciphertext. Failed
  writes preserve the original record and do not report successful unlock.

The bcrypt format remains compatible with older releases. Existing encrypted
account records and recovery access are preserved. No new permissions or data
collection are introduced. Historical web-only localStorage recovery copies are
outside this desktop-verifier change.

## Store release note

Security update: improved automatic wallet locking and password protection.
Existing desktop wallets receive stronger password verification after a
successful unlock. Account recovery and compatibility with older wallet backups
are preserved.

## Validation and publication

The security implementation passed 4,805 tests, 572 historical-upgrade checks,
and 25 packaged security checks before this version bump. The full clean-source
Chrome release gate must qualify the committed 4.2.1 package before upload,
including reproducible builds, production and Polkaswap smoke tests, upgrade
checks, and package-integrity audits. Local validation is authoritative; hosted
CI is not a prerequisite.

Keep the final source commit, exact ZIP and CRX hashes, release provenance,
validation receipts, and dashboard submission result in the ignored
`output/chrome-release-4.2.1/` directory. Use the existing verified-CRX upload key
under the procedure in `docs/verified-crx-uploads.md`. Do not change upload-key
enrollment or weaken the store's verified-upload requirement.

Cancel the pending 4.2.0 review only when the validated 4.2.1 package is ready to
replace it. Submit 4.2.1 for review with automatic publication after approval.
Submission is not evidence that Google has approved or published the update.
The user explicitly authorized commit, push, and this store update on
26 October 2026 JST. Git commits and release tags remain unsigned, as in the
existing release process; the upload CRX uses the existing Keychain signing key.
