# Verified CRX uploads

Chrome Web Store can require an independent RSA signing key for package uploads.
The dashboard receives only its public key. Keep the private key outside the
repository, build output, Google account, and ordinary CI credentials. Enrollment
is a separate dashboard step. The Node wrapper never handles private keys; the
macOS helper below provides local key custody and encrypted backup verification.

## macOS key custody

Compile `scripts/chrome-upload-keychain.swift` with `xcrun swiftc -O` to a stable,
user-owned path outside the checkout. The executable's path matters for Keychain
access approvals; do not repeatedly run copied binaries from temporary folders.
The following commands assume it is installed as `chrome-upload-keychain` inside
`~/Library/Application Support/Fearless Wallet/Chrome Upload Signing/`:

```sh
signer="$HOME/Library/Application Support/Fearless Wallet/Chrome Upload Signing/chrome-upload-keychain"
"$signer" self-test
"$signer" initialize
"$signer" verify-backup
```

`initialize` creates one RSA-3072 key in the current user's local macOS Keychain,
then tests encrypted backup recovery before reporting success. Repeated use
checks the existing key and backup. It writes only the public key
`upload-public-key.pem` and encrypted backup `upload-key.encrypted.json` in the
same custody directory. Directory permissions are 0700 and created files 0600.
Upload only the public key in Chrome Web Store's **Verified CRX Uploads** section.
Compare the displayed public-key SHA-256 fingerprint with the signing evidence.

The backup uses AES-256-GCM with a random 256-bit encryption key held as a separate
local Keychain generic-password item:

- Service: `jp.co.soramitsu.fearless.chrome-upload.backup`
- Account: `jp.co.soramitsu.fearless.chrome-upload.nhlnehondigmgckngjomcpcefcdplmgc.v1`

The encrypted file and its decryption key are **both local**. This protects the
private key at rest but does not alone protect against losing this Mac and its
Keychain. For disaster recovery, an authorized custodian must place a copy of the
encrypted JSON in an approved off-device backup and keep its encryption key in a
separate approved secret store, outside the Google account. Retrieve that secret
through Keychain Access; do not print it in logs, put it in shell arguments, or
commit it. The helper deliberately has no command that displays a private key or
backup password. `verify-backup` proves decryption and signing with the recovered
key in memory; it does not perform off-device backup or replace Keychain entries.

The backup format is versioned JSON. `sealedBoxBase64` contains CryptoKit's
AES-GCM combined representation (nonce, ciphertext and tag), with the fixed
application/item context in the helper as authenticated data. The encrypted
plaintext is the RSA private key in PKCS#1 DER. A recovery implementation must
verify the recorded public-key fingerprint and a signing challenge before
restoring custody. Never enroll a replacement key merely because local custody
is missing; preserve the backup and recover the existing key first.

Use the ZIP produced by the normal, fully passing `yarn prepare:chrome-release`
process. Verify its digest against `chrome-release-provenance.json` first. Signing
does not replace the release gates or authorize a different artifact. Never edit
or repack a submitted ZIP just to sign it. The existing manifest `key`, extension
ID and OAuth configuration are preserved byte for byte.

## Sign through a separate key holder

Requires Node 24 or later; no third-party runtime dependencies. The public key
must be RSA (2048–8192 bits), encoded as SPKI DER or `BEGIN PUBLIC KEY` PEM.

```sh
node scripts/verified-crx.mjs prepare-signing-payload \
  --zip /secure/release/verified.zip \
  --public-key /secure/signing/upload-public.pem \
  --out-prefix /secure/release/upload
```

This creates `upload.payload.bin` and `upload.metadata.json` without overwriting
existing files. Have the separate key holder sign **the entire payload file**
using SHA-256 with RSA PKCS#1 v1.5 padding, yielding a raw binary signature.
Do not use RSA-PSS, sign only the ZIP, or hash the payload twice. For a macOS
Keychain signer the matching algorithm is
`SecKeyAlgorithm.rsaSignatureMessagePKCS1v15SHA256`.

With the supplied macOS helper:

```sh
"$signer" sign /secure/release/upload.payload.bin /secure/release/upload.signature.bin
```

The signer accepts only CRX3 payloads containing its own public-key-derived ID,
checks its signature immediately, and refuses to overwrite an existing output.

```sh
node scripts/verified-crx.mjs assemble \
  --zip /secure/release/verified.zip \
  --public-key /secure/signing/upload-public.pem \
  --signature /secure/release/upload.signature.bin \
  --out /secure/release/verified.crx

node scripts/verified-crx.mjs verify \
  --crx /secure/release/verified.crx \
  --expected-public-key /secure/signing/upload-public.pem \
  --expected-zip /secure/release/verified.zip
```

Assembly verifies the signature before writing anything. Verification pins both
the public key and every byte of the original ZIP, and prints their SHA-256
digests. Upload the resulting `.crx` to the existing Store item after enrollment.
The upload signer's CRX ID derives from its public key; it is separate from the
existing Store item's identity. Do not replace the manifest's Store key with the
upload key. Keep the original ZIP, provenance, CRX digest and verification result
with the release record. No private material is printed or accepted by this tool.

The parser deliberately supports our deterministic ZIP32 packages and the
single-RSA-proof CRX3 upload format, not arbitrary ZIP generators or Store-signed
download packages containing additional publisher proofs. It rejects malformed
framing, duplicate fields, unexpected keys, truncated data and altered payloads.

Run `node --test scripts/test-verified-crx.mjs` for ephemeral-key regression
tests, including tampered packages, wrong keys and unsupported signature padding.

## Format references

- [Chrome Web Store update protection](https://developer.chrome.com/docs/webstore/update#protect-your-package-updates)
- [Chromium CRX3 protobuf format](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/crx3.proto)
- [Chromium signature verifier](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/crx_verifier.cc)

The protobuf's RSA-PSS comment is stale: Chromium's verifier uses
`RSA_PKCS1_SHA256`. The signed message is the ASCII context `CRX3 SignedData`, a
NUL byte, a four-byte little-endian signed-header length, signed-header protobuf
bytes, and the unchanged ZIP bytes. The signed header contains the first 16 bytes
of the public key's SHA-256 digest as the CRX ID.
