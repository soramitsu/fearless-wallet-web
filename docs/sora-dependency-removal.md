# SORA SDK dependency removal

The web wallet now implements the SORA operations it uses in `src/sora`.
It has no runtime import, package dependency, or download URL for the retired
SORA JavaScript repository. The active XCM review checkout receives the same
replacement. The browser-release checkout also includes the replacement, including
its newer portfolio/dashboard imports. Yarn is the declared package manager; the obsolete pnpm lockfile
was removed so it cannot reinstall the retired packages.

The implementation uses the existing Polkadot API for metadata, storage,
transaction encoding and signing; BigNumber for decimal arithmetic; and the
existing cryptographic primitives for cosigner envelopes. No upstream SDK
JavaScript is vendored. Account selection, recovery restrictions, consent and
mutation guards remain in the existing wallet services. The browser-release
connection handler owns a separate API/provider per endpoint and computes DEX
state and fees in an isolated client. Stale initialization cannot overwrite the
new connection or publish its results. The local submit
boundary rejects locked/stale signers and changed registries, reports dispatch
and batch failures, and waits for finalization. It never exports a mnemonic or
sends key material to a network service.

Integration regressions also cover direct fee refreshes: results are bound to
their API, registry and request order. Validator estimates convert VAL rewards
to XOR before comparing them with bonded stake; an unavailable quote retains
the existing default estimate without blocking recovery data. Pool withdrawal
amounts respect the runtime's virtual minimum liquidity and full-burn boundary;
an unrepresentable partial request never silently burns the entire position.

Legacy SCALE definitions are pinned inert JSON, with extraction hashes and
license attribution under `src/sora/schema`. They were extracted as literals,
without importing or evaluating the retired package. Runtime metadata supplies
the current storage/extrinsic layouts. The companion Polkaswap indexer also uses
local schemas and exposes `/runtime/sora-mobile-types.json`; its mobile config
now points to `https://pi.soramitsu.io/runtime/sora-mobile-types.json`.
The indexer deployment/proxy must publish that route before old hosting is removed.

The legacy cosigner envelope keeps its existing AES-CBC wire format for
compatibility. This format has no authentication tag; decrypted call data is
untrusted and still requires normal wallet review and authorization. The unused
SDK encryption helpers with a fixed shared passphrase were not carried over.
New code clears temporary agreement/session keys and the keyring's temporary
exported signing key after use. This change does not repair secrets disclosed
by previously installed wallet versions.

`audit:sora-removal` and the shared Vite build guard reject reintroduced packages,
lockfile entries, installed package residue, source imports, and repository URLs.
Source provenance is explicitly exempted from the text scan and is not bundled.
Archived evidence and historical Git revisions are outside the shipping source.

Validation includes the web unit suite, dedicated decimal/cosigner/client/staking
regressions, TypeScript and lint checks, production Chrome compilation, and a
read-only SORA smoke check for runtime metadata, DEX registry, asset metadata,
swap quotes, and operation fee estimates. No account transaction is submitted by
these checks. Browser-store publication and indexer deployment are separate steps;
this source patch does not update already installed extensions or deployed services.
