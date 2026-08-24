# Iroha Production Send Readiness (Browser Extension)

Status for the Chrome Web Store profile: **BLOCKED / fail closed**. This is not
an implemented production-send claim. `VUE_APP_ENABLE_IROHA_TRANSFERS=false`,
SORA Nexus remains `enabledByDefault: false`, and the codec loader returns
unavailable while the Store release flag is false. The former
`globalThis.__IROHA_NATIVE_BINDING__` seam has been removed from source and is
forbidden in both Store and transfer-test artifacts.

One separately identified non-Store `transfer-test` profile sets the Iroha
policy flag to true and bundles the checksum-pinned legacy candidate for local
UI and offline signing compatibility checks. Its exact compatibility policy is
`legacy-offline-only`: fee estimation and submission return
`iroha_transfer_protocol_mismatch` before account lookup, mnemonic export,
signing, or Torii access. The shared Vite configuration rejects Iroha enablement
outside that exact production-mode Chrome test profile.

Current 2026-08-24 status: the GitHub release and tag referenced below still
exist, but the JavaScript 0.0.2 asset is no longer attached and its former URL
returns HTTP 404. The exact reviewed tarball was recovered byte-for-byte from
Yarn's content cache and is now pinned at
`vendor/iroha-js/iroha-iroha-js-0.0.2.tgz`; the release audit verifies its
digest, fail-closed browser surface, and installed contents. This restores
durable account/read dependency installation, not browser transaction-codec
availability or production-send approval. Historical release URLs, ABI values,
fixture counts, and bundle measurements below remain dated evidence. A
separate local ABI-21/V4 reconciliation now has stricter source-bound fixtures,
reviewed dependency-lock and browser-graph gates, but it is isolated,
uncommitted, unpublished, and not bundled into the Store runtime. It
cannot unblock production send until a clean native build, independent review,
immutable publication, checksum-pinned integration, and funded live receipt
evidence all pass.

## Pinned upstream evidence

The dependency originated from the official Hyperledger Iroha release
[`v2.0.0-rc.2.1-fearless-mobile-sdk.3`](https://github.com/hyperledger/iroha/releases/tag/v2.0.0-rc.2.1-fearless-mobile-sdk.3),
published on 2026-06-25. Its JavaScript asset was subsequently removed, so the
exact reviewed bytes are now vendored in this repository:

- artifact: `iroha-js-0.0.2-v2.0.0-rc.2.1-fearless-mobile-sdk.3.tgz`
- SHA-256: `68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339`
- release size: `1843179` bytes

The package includes the Nexus application orchestration and browser-safe
Ed25519 primitives, but not a browser/WASM consensus transaction encoder. Its
`dist/native.browser.js` throws `iroha_js_host is unavailable in browser builds.`
The Nexus client's default payload builder and finalizer call that native
binding and otherwise raise `transaction_codec_unavailable`. No official WASM
artifact is present in the release.

The runtime global codec seam has been removed. Private key material must never
be sent to a server to compensate for an unpublished or incompatible client
artifact.

## Final local SDK candidate is not a release artifact

The final browser-safe `0.0.3` candidate was built from source base
`b423c0f8bcd317fd945d6f66ce3fa679401dba7f` plus the frozen candidate patch.
It exposes `@iroha/iroha-js/transaction-codec`, but neither that source nor the
candidate tar has been pushed, independently reviewed, or published as an
immutable release. It is checksum-pinned and bundled only by the explicitly
non-Store `transfer-test` profile, not as the Store production dependency. The
Store production dependency remains the vendored exact `0.0.2` release
artifact, which has no transaction-codec subpath.

The exact local candidate recorded on 2026-07-12 is now durably preserved as
non-production evidence under
`artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f`.
The evidence manifest SHA-256 is
`723c46192d369dac939f75d1ef1fb2f82456b3cd6afbd0ac51c0071383871a4d`;
the frozen patch SHA-256 is
`b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049`;
and the exact base tree is `f5e47336c7ba64f43e629636fd0b0b31ca39a22e`.
This evidence path is referenced by the development-only
`@iroha/iroha-js-transfer-codec` package alias and the exact gated transfer-test
loader. It remains excluded from the Store runtime. Its package identity is:

- 154 package files and 154 archive entries
- 1,281,259 packed bytes and 7,914,958 unpacked bytes
- npm SHA-1 `8ee3a23653fc4e2648f81dc12ce5cf00d36b4439`
- tar SHA-256 `15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8`
- integrity `sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==`

`scripts/verify-iroha-js-candidate.sh` verifies the evidence offline and can
reconstruct the exact candidate-relevant base into a disposable checkout from
the stored bounded archive, apply all 32 patch paths, validate every resulting
byte/mode, restore only the stored generated 134-byte Darwin arm64 checksum
sidecar, and prove that `npm pack --ignore-scripts` reproduces the tar
byte-for-byte. No live Iroha checkout, Git fetch, or network access is used.

The replay archive SHA-256 is
`cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c`:
2,412,361 compressed bytes, 15,319,040 expanded bytes, and 305 exact entries
(285 regular files and 20 directories). Its inventory SHA-256 is
`949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4`,
and its reconstructed subset tree is
`04fbf3b60512c7daf734d3f72c6a60ceb79316af`. It deliberately excludes tracked
`javascript/iroha_js/node_modules`, so the full base repository is not bundled
and `offlineFullSourceReplayable` truthfully remains false even though the
candidate itself is now entirely replayable offline. The parser rejects
over-limit compression, traversal, links/special files, duplicates, unsafe
extraction, commit/tree mismatch, and any extra, missing, or changed inventory
entry. Its adversarial suite passes 40 checks, including portable replay from
an isolated repository with no dependency on the live Iroha checkout.

The final `node --test` command executed 2,317 tests: 2,244 passed, 73
intentional skips, and zero failed, cancelled, or todo. Focused validation also
recorded browser/package 23/23, package/type 5/5, affected regression 220/220,
package-dist 132/132, local crypto-adapter guard 8/8, Kagemusha static parity
76/76, changed runtime source/dist 6/6 exact, and broader packed runtime
composition 14/14 exact. ESLint, changelog, `build:dist`, bundle checks,
`git diff --check`, and full and production-only npm audits passed; both audits
reported zero vulnerabilities.

For the frozen unpublished candidate recorded on 2026-07-12, pinned esbuild
`0.28.1` produced these exact historical bundle results:

- Torii: 854,715 bytes, 57 modules, cap 840 KiB
- browser transaction codec: 125,424 bytes, 36 modules, cap 132 KiB
- browser Nexus: 206,556 bytes, 45 modules, cap 205 KiB
- canonical request: 69,529 bytes, 31 modules, cap 75 KiB
- browser IVM: 9,644 bytes, 7 modules, cap 12 KiB
- browser Kotodama: 51,000 bytes, 6 modules, cap 51 KiB
- public browser aggregate: 304,385 bytes, 51 modules, cap 300 KiB

All ten unique explicit browser export graphs passed forbidden-Node-edge,
static global-`Buffer`, and runtime `Buffer` guards with zero forbidden Node
inputs and zero global-`Buffer` assignments.

The current upstream reviewed bundle contract is newer and is recorded
separately from that frozen-candidate history. At contract source commit
`f6f8706977f5b3589ddbaea4d92f0e871b1cbe82`, pinned esbuild `0.28.1` defines:

- browser Nexus: reviewed baseline 215,950 bytes, 46 modules, exact 216 KiB
  (221,184-byte) cap, 5,234 bytes (2.42%) headroom
- public browser aggregate: reviewed baseline 314,580 bytes, 52 modules,
  exact 328 KiB (335,872-byte) cap, 21,292 bytes (6.77%) headroom

Both reviewed targets require zero forbidden Node inputs and zero global
`Buffer` assignments. These are upstream source-contract facts, not evidence
that an immutable `0.0.3` artifact was reviewed, published, pinned, or bundled
by this project.

A separate 2026-07-16 observation of dirty upstream working tree
`0fcb6a6961b8a15913c73a265a92877f69ceed4b` measured browser Nexus at 216,052
bytes / 46 modules and the public browser aggregate at 314,735 bytes / 52
modules. Those observations were 102 and 155 bytes above the respective
reviewed baselines, remained below the reviewed caps, and retained zero
forbidden Node inputs and zero global `Buffer` assignments. They are explicitly
not reviewed-baseline or release-artifact evidence. The full dirty-tree bundle
check stopped on the unrelated Torii bundle at 933,497 bytes against its 896
KiB cap. None of these observations changes the **BLOCKED / fail closed**
status.

A fresh ephemeral, non-replayable clean harness installed only the exact final
tar (SHA-256 `15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8`)
and esbuild `0.28.1`. Its Safari-17-targeted
aggregate of all 18 public subpaths was 1,648,973 bytes with 67 esbuild inputs,
28 package inputs, zero forbidden Node inputs, and zero static `Buffer`
mutations. Isolated Node evaluation began with global `Buffer` removed, exposed
all 18 namespaces, and left `Buffer` absent. The generic root entry correctly
failed browser bundling with 22 unresolved Node-builtin edges. These results are
static and Node-runtime compatibility evidence only.

Native Safari runtime QA now passes against the exact final tar. Safari 26.5.2
executed **6 real Safari scenarios and 91 real Safari assertions**, with zero
failures. WebDriver remote automation and Apple-event JavaScript both remained
disabled. The replayable launcher instead serves a self-running page from an
ephemeral exact `http://127.0.0.1:<port>` origin, binds a random 32-byte nonce,
the candidate tar digest, the assertion inventory, and the generated bundle
digest, and reads only Safari's documented read-only document text property.
It creates and closes exactly one owned Safari window by ID and exact URL.

The executed Safari bundle is pinned at 1,127,726 bytes, 79 esbuild inputs, 39
candidate-package inputs, and SHA-256
`f7781764f541f2c27b70b36f92bda81cddcad128918de73d67404746474a04ab`.
The 91-assertion inventory digest is
`31b68d1c57fa6c652ceea255c43952bab43ef294358db31d31a4e03573543572`.
Stored evidence is
`artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json`
(SHA-256
`02184886d34343924cfe9de378249759fb41b3430d2cd36ec83337955401368a`).
The report contract passes 46 adversarial checks, the stored-evidence verifier
passes 18 adversarial checks, and the launcher boundary passes 11 checks. The
older static and Node-runtime browser-graph checks above remain compatibility
evidence only; they are not counted as Safari assertions. Passing Safari
closes only the local browser-runtime gate and does not publish, independently review,
pin, or production-integrate the candidate, nor does it satisfy live network
evidence.
The upstream evidence also records 1/1 Rust data-model and 1/1 Rust N-API builder/finalizer tests.
Cross-language result: canonical, Android, Swift, and Python fixture families contain exactly 27 entries each, share fingerprint `f4f93f7ca4c6c244130e7bbd5b518df8`, and `norito-rpc-verify` verified all 27 canonical entries.
Rust result: exporter 20/20 and xtask unit 17/17; JavaScript fixture consumers 22/22; Java QA 111/111 plus 27 exported entries; Kotlin selected result 14/14; Python fixture result 47/47.
Swift result: transaction parity ran 11 tests with 6 passes, 5 expected stale-bridge skips, and zero failures; the broader changed-callsite gate ran 123 with 89 passes, 34 expected stale-bridge skips, and zero failures. The validation-fee focus passed 5/5 and an independent QA seam passed 3/3. Production remains blocked because the ignored 1.3 GB `NoritoBridge.xcframework` exposes ABI 8 while the minimum is 14. The frozen candidate evidence below covers source ABI 17; the current upstream working source is ABI 20 and has not produced a reviewed replacement artifact or equivalent frozen cross-language evidence.
Frozen ABI-17 source/header result: exact inventories contain 6 proof plus 15 protocol symbols across Rust, C, and Swift. Exact Rust/C signatures are pinned for all 21 symbols plus the exact `connect_norito_free` Rust/C/Swift shape. The header positive gate passed, all 15 header negative controls passed, JavaScript parity passed 76/76, and the focused Swift V2 slice passed 3/3. These historical candidate checks do not claim ABI-20 parity and do not replace the stale ABI 8 production artifact.
Fixture alignment reported zero mismatches and zero intentional family omissions.

Stable `cargo check -p iroha_core` now passes after adding fail-closed RedeemV2 execution and a direct handler-table no-mutation regression (1/1). It reports 28 non-fatal pre-existing dead-code warnings: 12 dormant Kagemusha V2 fail-closed helpers/constants and 16 unrelated warnings. Scoped Rust formatting, `cargo fmt --all -- --check`, `git diff --check`, and the codec/fixture checks pass; there is no remaining compile or formatting blocker in this scoped repair.

The final Kagemusha V2 policy/Torii closure is also green: 12/12 durable Torii-focused tests, 3/3 Core global-operation-ID tests, and 76/76 JavaScript static ABI-parity tests passed. `cargo check -p iroha_torii` completed with zero errors and the same 28 existing Core warnings; test-profile builds expose 31 warnings because three additional test-only items are compiled. The main policy passed. Canonical OpenAPI generation produced byte-identical root/current 663,006-byte specs with SHA-256 `d773d734b5baddc20725982874ed7ef76320ab74e4b99402b2a36d4892764ae3`, BLAKE3 `e771c3beac43c73b9628c7798b7401631b84508f8cd2fb3edc547124c157f960`, and dirty-source digest `665e6c059696facaadbd84e2f8203dc6aaf2a0bd8d24329e7774e4f0fe6ce36c`. The manifest is intentionally dirty and unsigned with `generator_commit=null`: default/release verification rejects it, while explicit development `--allow-unsigned` verification passes. The current redeem route explicitly returns 503 fail-closed; a 200 response is documented only as conditional, unreachable future behavior. OpenAPI xtask passed 20/20, portal tests passed 54/54, focused Torii passed 1/1, and the CI checker passed. V2 redeem remains fail closed until a canonical atomic operation-receipt backend exists.

The focused modes cover native payload/prehash and finalizer/pipeline-hash parity; package subpath, tarball, and TypeScript exports; cross-language compact framing and raw-hasher contracts; and source/dist parity.
Strict uncofactored Ed25519 verification enforces canonical compressed points and rejects small-order and mixed-torsion inputs.
Metadata validation requires Unicode scalar values, rejects C0/C1 controls where prohibited, accepts only dense data-only arrays and plain objects without invoking accessors, preserves Rust plain JSON control escaping, and requires exact canonical metadata JSON strings so alternate numeric spellings and duplicate keys fail closed.

Adversarial resource checks enforce bounds before BigInt conversion, UTF-8 decoding, or byte copying.
They cover the interoperable positive Numeric bound of `2^511 - 1` in 64 bytes; pre-decode caps for chain ID, transfer wire ID, metadata key, and metadata JSON fields; oversized canonical signed payloads; and defensive snapshots of Buffer, ArrayBuffer, and SharedArrayBuffer views to close mutation/TOCTOU seams.
Contradictory keys, malformed or non-canonical archives, overlong and empty inputs, wrong networks, wrong signatures, and the defective fixed-width transaction-hash framing are all rejected.
The shared vector is asserted in Rust, JavaScript, Kotlin, Java, and Swift.

The Nexus application independently recomputes the payload hash both when a draft is built and before finalization, verifies the canonical browser signed-transaction hash before submission, requires an exact finalizer hash, and independently finalizes the expected bytes and hash. Byte and hash aliases must agree, direct and nested Torii response aliases must agree, byte caps run before copying, and an injected payload hasher cannot bypass the canonical local computation.

Its browser entry imports Buffer explicitly, uses a browser-only crypto/codec dependency graph, and defaults to a bounded Fetch Torii transport with omitted credentials, rejected redirects, suppressed referrers, timeouts, response caps, and response-stream cancellation. Configuration, Connect options/sessions, wallet approvals, transfer drafts, signables, signatures, and finalize options are copied from exact data-descriptor allowlists before use, so accessors, symbols, inherited properties, unsupported keys, and Proxy get traps fail closed. Packed browser declarations compile with `types: []` and no ambient Node types.

Every signer callback now receives only a detached canonical Transfer::Asset signable after payload decoding, payload-hash recomputation, approved authority, and signing-key binding succeed. Wrong hashes, noncanonical bytes, wrong authority/key/session values, and conflicting Connect/approval/transfer alias families fail before injected or app-session signers run. Wait options are fully validated before Torii side effects, duplicate raw statuses count toward the iterable cap before deduplication, and noncanonical fractional trailing-zero Numeric archives are rejected.

The shared deterministic vector is sourced from tag
`v2.0.0-rc.2.1-fearless-mobile-sdk.3` at commit
`4f8cfbdd17aa6a3b049e619f23ec02501e5297b6`:

- versioned bytes: `565`; bare bytes: `564`
- versioned SHA-256:
  `73dd9a04a34c0acb5c4b44021389bd06910a60eeab05936c3afe425aa5374c7e`
- payload prehash:
  `e673f611d9d42b02f5c1ff55ec6c2133c51b9a20be1f4eaa84f32ed9ffb2c395`
- compact length/prefix: `b404` / `00000000b404`
- canonical external-entrypoint hash:
  `2332d0004eb24d97fd965fe68f6f31b0e51339764b4dd80f3ea50a3b6f7e5003`
- rejected fixed-width framing hash:
  `2b5e69a0a3d333756f4ac2a54bf7eaff88a2c87484d89e6e7da98abea659662d`

## Enforced blocker

The machine-readable state is
`config/iroha-production-send-readiness.json`. The blocker code is
`browser_transaction_codec_unpublished_source_only`. It means the implementation
exists as the exact local candidate above, but no reviewed immutable codec
artifact is published, pinned, and bundled into this extension. Native Safari
QA is now separately green and is no longer part of this blocker. Run:

```bash
bash scripts/test-iroha-production-send-readiness-audit.sh
bash scripts/test-iroha-js-candidate-verifier.sh
bash scripts/verify-iroha-js-candidate.sh
bash scripts/test-iroha-js-candidate-safari-qa.sh
node scripts/verify-iroha-js-candidate-safari-qa-evidence.mjs
bash scripts/audit-iroha-production-send-readiness.sh
```

The Store-readiness audit rejects any ordinary build environment or checked-in
environment file that enables Iroha transfers. It also fails if the exact test
package pin changes, Nexus becomes enabled by default, the removed global seam
reappears, the candidate codec appears outside the audited transfer-test
loader, the extension send handler bypasses that loader, no-secret/no-network
tests disappear, the durable candidate evidence is tampered with, or this
evidence loses its exact tag/digest/size/test-total/bundle markers or falsely
claims Safari evidence.

`yarn test:vendored-iroha-sdk-audit` and
`yarn audit:vendored-iroha-sdk` prove the 0.0.2 package integrity and confirm
this browser limitation.

Passing it does **not** make Iroha send production-ready. The stricter
`check-iroha-js-sdk-artifact.sh` policy applies to a future production-send
candidate and intentionally rejects this legacy 0.0.2 package because it lacks
the hardened browser codec and IVM exports.

## Remaining live gates

Before enablement, Fearless must:

1. Obtain a published, independently reviewed, immutable codec artifact; pin
   its digest and transitive dependencies; bundle its
   `@iroha/iroha-js/transaction-codec` import; and rerun the recorded golden and
   adversarial tests against that exact artifact.
2. Resolve and verify the live Taira and Nexus asset definition/source holding
   instead of treating UI asset text as ledger truth.
3. Implement node-backed fee, fee-asset, balance, and spendability preflight;
   no fabricated fee is accepted by the current test profile.
4. Confirm reviewed production Torii endpoints and TLS, chain identifiers,
   I105 discriminants, codec compatibility, submission, and status behavior for
   both Taira and Nexus. Nexus has no approved production endpoint today.
5. Record funded, status-confirmed Taira and Nexus broadcasts from the pinned
   production bundle before changing either release flag or Nexus default.

Mnemonic/private-key material must remain local, copied secret material must be
cleared on a best-effort basis, and no runtime global codec dependency may be
introduced.
