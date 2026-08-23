# Fearless `browserify-sign` compatibility shim

The Vite Node-polyfill dependency graph includes `browserify-sign`, whose
unpatched `elliptic` dependency is affected by GHSA-848j-6mx2-7j84. Fearless
does not use Node-style `crypto.createSign` or `crypto.createVerify`; every
wallet signing path uses a chain-specific implementation with its own tests.

This shim preserves the module shape expected by `crypto-browserify` and fails
closed if an unexpected caller reaches either generic signing API.
