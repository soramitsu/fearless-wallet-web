# Fearless `bip322-js` compatibility shim

`@subwallet/keyring` imports `Signer` from `bip322-js`, although Fearless does
not expose that Bitcoin-message-signing path. The upstream package depends on
unpatched `elliptic` releases affected by GHSA-848j-6mx2-7j84.

Fearless Bitcoin transfers use the separately tested BIP84 transaction builder
and signer. This compatibility package therefore preserves the imported API but
fails closed if the unused Subwallet BIP-322 path is ever invoked. Do not add a
signing implementation here without a separate protocol/security review and
dedicated conformance tests.
