# Fearless `create-ecdh` compatibility shim

The Vite Node-polyfill dependency graph includes `create-ecdh`, whose unpatched
`elliptic` dependency is affected by GHSA-848j-6mx2-7j84. Fearless has no use
for the generic Node-style browser `createECDH` API. This compatibility module
keeps `crypto-browserify` loadable while making any unexpected invocation fail
closed.
