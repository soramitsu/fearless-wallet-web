# Disabled Android ADB cryptography

`web-ext` loads `@devicefarmer/adbkit`, which imports `node-forge` for Android
ADB authentication. This repository validates desktop Firefox, and does not
use that Android authentication feature. The upstream RSA verifier has no
published fix for [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
as of 22 October 2026.

This private, dependency-free shim preserves the shape needed for module
loading and throws if Android ADB cryptography is requested. It contains no
RSA parser or verifier; no signature can be accepted. It does not replace
wallet signing code or Node's TLS implementation. Android ADB operations are
intentionally unavailable in this development toolchain. Desktop web-ext
loading, lint and Firefox smoke remain required checks.

Remove the shim when a reviewed upstream fix can replace it. Do not restore
Android authentication by silently falling back to vulnerable code.
