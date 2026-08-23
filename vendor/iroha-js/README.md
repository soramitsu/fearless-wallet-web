# Vendored Iroha JavaScript SDK 0.0.2

`iroha-iroha-js-0.0.2.tgz` is the exact package previously published as
`iroha-js-0.0.2-v2.0.0-rc.2.1-fearless-mobile-sdk.3.tgz` on the Hyperledger
Iroha GitHub release `v2.0.0-rc.2.1-fearless-mobile-sdk.3`.

The upstream JavaScript asset was later removed while this web project still
depended on its URL. The archive here was recovered from Yarn's content cache
and reproduced with `npm pack --ignore-scripts`. It is byte-for-byte identical
to the original reviewed artifact:

- bytes: `1,843,179`
- files/archive entries: `141`
- SHA-256: `68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339`
- npm integrity: `sha512-xgYC90huCue607RGBHRfXo46eafmy96/IyQ7GODYqB1f9icWRyHp5ShiiUol/2zCfuQuBipzVBkE1AgckG27GQ==`

This package is retained only to make the existing 0.0.2 account/read support
installable and reproducible. It does not expose the reviewed browser
`transaction-codec` or `ivm-artifact` entry points from the unpublished 0.0.3
candidate. Iroha transfers must remain disabled; do not replace this package
with that candidate or treat this vendoring as production-send approval.

Run `yarn audit:vendored-iroha-sdk` after dependency installation. The audit
pins the archive bytes and digest, validates its fail-closed browser surface,
and compares all installed package files byte-for-byte with this archive.
