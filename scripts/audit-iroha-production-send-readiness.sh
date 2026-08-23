#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${IROHA_SEND_AUDIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))}"
MANIFEST="$ROOT_DIR/config/iroha-production-send-readiness.json"
DOC="$ROOT_DIR/docs/iroha-production-send-readiness.md"
RELEASE_CHECKLIST="$ROOT_DIR/docs/release-checklist.md"
UNIVERSAL_DOC="$ROOT_DIR/docs/universal-wallet-v2.md"
PACKAGE_JSON="$ROOT_DIR/package.json"
LOCKFILE="$ROOT_DIR/yarn.lock"
PRODUCTION_CODEC="$ROOT_DIR/src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts"
TRANSFER="$ROOT_DIR/src/extension/background/extension-base/src/api/iroha/transfer.ts"
TRANSFER_TEST="$ROOT_DIR/tests/unit/iroha-background-transfer.spec.ts"
EXTENSION_HANDLER="$ROOT_DIR/src/extension/background/extension-base/src/background/handlers/Extension.ts"
REGISTRY="$ROOT_DIR/src/consts/universalWallet.ts"
SDK_CHECKER="$ROOT_DIR/scripts/check-iroha-js-sdk-artifact.sh"
VENDORED_SDK_AUDIT="$ROOT_DIR/scripts/audit-vendored-iroha-js-sdk.mjs"
VENDORED_SDK_TARBALL="$ROOT_DIR/vendor/iroha-js/iroha-iroha-js-0.0.2.tgz"
CANDIDATE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-candidate.sh"
CANDIDATE_VERIFIER_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-verifier.sh"
BASE_ARCHIVE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-base-source-archive.mjs"
CANDIDATE_EVIDENCE="$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f"
CANDIDATE_MANIFEST="$CANDIDATE_EVIDENCE/candidate.json"
CANDIDATE_PATCH="$CANDIDATE_EVIDENCE/b423c0f8-to-final-candidate.patch"
CANDIDATE_TARBALL="$CANDIDATE_EVIDENCE/iroha-iroha-js-0.0.3.tgz"
CANDIDATE_BASE_ARCHIVE="$CANDIDATE_EVIDENCE/b423c0f8-iroha-js-candidate-replay-base.tar.gz"
CANDIDATE_BASE_INVENTORY="$CANDIDATE_EVIDENCE/b423c0f8-iroha-js-candidate-replay-base.inventory.tsv"
SAFARI_QA_CONTRACT="$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-contract.mjs"
SAFARI_QA_ENTRY="$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-entry.mjs"
SAFARI_QA_SUITE="$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-suite.mjs"
SAFARI_QA_RUNNER="$ROOT_DIR/scripts/run-iroha-js-candidate-safari-qa.mjs"
SAFARI_QA_LAUNCHER="$ROOT_DIR/scripts/run-iroha-js-candidate-safari-qa.sh"
SAFARI_QA_CONTROL="$ROOT_DIR/scripts/iroha-js-candidate-safari-control.applescript"
SAFARI_QA_SELF_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa.sh"
SAFARI_QA_CONTRACT_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-contract.mjs"
SAFARI_QA_EVIDENCE_VERIFIER="$ROOT_DIR/scripts/verify-iroha-js-candidate-safari-qa-evidence.mjs"
SAFARI_QA_EVIDENCE_TEST="$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-evidence.mjs"
SAFARI_QA_EVIDENCE="$ROOT_DIR/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json"
BUILD_CONFIG="$ROOT_DIR/vite.config.shared.mjs"
EXPECTED_MANIFEST_SHA256="b8d9f4797b182338096b2ee124ab337e4bf38985405f3a3e98df46acbaa40d1b"
SDK_DEPENDENCY="file:vendor/iroha-js/iroha-iroha-js-0.0.2.tgz"
SDK_TARBALL_BYTES="1843179"
SDK_TARBALL_SHA256="68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339"
TMP_MATCHES="$(mktemp "${TMPDIR:-/tmp}/fearless-web-iroha-send-audit.XXXXXX")"
trap 'rm -f "$TMP_MATCHES"' EXIT

fail() {
  echo "[iroha-send-readiness][web][error] $*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

require_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "required regular file is missing or is a symlink: $path"
}

require_fixed() {
  local path="$1"
  local marker="$2"
  local label="$3"
  grep -Fq -- "$marker" "$path" || fail "$label is missing from ${path#"$ROOT_DIR/"}"
}

for path in \
  "$MANIFEST" "$DOC" "$RELEASE_CHECKLIST" "$UNIVERSAL_DOC" "$PACKAGE_JSON" "$LOCKFILE" "$PRODUCTION_CODEC" \
  "$TRANSFER" "$TRANSFER_TEST" "$EXTENSION_HANDLER" "$REGISTRY" "$SDK_CHECKER" \
  "$VENDORED_SDK_AUDIT" "$VENDORED_SDK_TARBALL" "$CANDIDATE_VERIFIER" \
  "$CANDIDATE_VERIFIER_TEST" "$BASE_ARCHIVE_VERIFIER" "$CANDIDATE_MANIFEST" "$CANDIDATE_PATCH" \
  "$CANDIDATE_TARBALL" "$CANDIDATE_BASE_ARCHIVE" "$CANDIDATE_BASE_INVENTORY" \
  "$CANDIDATE_EVIDENCE/README.md" "$SAFARI_QA_CONTRACT" "$SAFARI_QA_ENTRY" \
  "$SAFARI_QA_SUITE" "$SAFARI_QA_RUNNER" \
  "$SAFARI_QA_LAUNCHER" "$SAFARI_QA_CONTROL" "$SAFARI_QA_SELF_TEST" \
  "$SAFARI_QA_CONTRACT_TEST" "$SAFARI_QA_EVIDENCE_VERIFIER" "$SAFARI_QA_EVIDENCE_TEST" \
  "$SAFARI_QA_EVIDENCE" "$BUILD_CONFIG"; do
  require_file "$path"
done
for marker in \
  'EXPECTED_PAYLOAD_HASH_HEX' \
  'EXPECTED_FINALIZED_HASH_HEX' \
  'EXPECTED_CANONICAL_MESSAGE_HEX' \
  'runtime.global_buffer_initially_absent' \
  'codec.reject_signature_tamper' \
  'nexus.global_buffer_after_submit'; do
  require_fixed "$SAFARI_QA_SUITE" "$marker" "native Safari assertion-suite marker '$marker'"
done

[[ "$(wc -c < "$MANIFEST" | tr -d '[:space:]')" -le 32768 ]] || fail "readiness manifest exceeds 32 KiB"
actual_manifest_sha256="$(sha256_file "$MANIFEST")"
[[ "$actual_manifest_sha256" == "$EXPECTED_MANIFEST_SHA256" ]] ||
  fail "readiness manifest digest mismatch: expected $EXPECTED_MANIFEST_SHA256, got $actual_manifest_sha256"

node - "$MANIFEST" <<'NODE'
const fs = require('node:fs');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
} catch (error) {
  console.error(`[iroha-send-readiness][web][error] invalid readiness JSON: ${error.message}`);
  process.exit(1);
}
function assert(condition, message) {
  if (!condition) {
    console.error(`[iroha-send-readiness][web][error] ${message}`);
    process.exit(1);
  }
}
assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
assert(manifest.platform === 'browser-extension', 'platform must be browser-extension');
assert(manifest.status === 'blocked', 'status must remain blocked');
assert(manifest.releaseEnabled === false, 'releaseEnabled must remain false');
assert(manifest.nexusEnabledByDefault === false, 'Nexus must remain disabled by default');
assert(manifest.upstream?.repository === 'hyperledger/iroha', 'unexpected upstream repository');
assert(manifest.upstream?.tag === 'v2.0.0-rc.2.1-fearless-mobile-sdk.3', 'unexpected upstream tag');
assert(manifest.artifact?.name === 'iroha-js-0.0.2-v2.0.0-rc.2.1-fearless-mobile-sdk.3.tgz', 'unexpected JavaScript artifact');
assert(manifest.artifact?.sha256 === '68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339', 'unexpected JavaScript artifact digest');
assert(manifest.artifact?.bytes === 1843179, 'unexpected JavaScript artifact size');
assert(manifest.artifact?.browserTransactionEncoder === false, 'browser transaction encoder must remain explicitly unavailable');
assert(manifest.artifact?.containsTransactionCodecSubpath === false, 'pinned release must remain explicitly without the transaction-codec subpath');
assert(manifest.artifact?.nativeBrowserError === 'iroha_js_host is unavailable in browser builds.', 'unexpected browser native-binding evidence');
assert(manifest.sourceEvidence?.observedAt === '2026-07-12', 'unexpected local source observation date');
assert(manifest.sourceEvidence?.state === 'validated-durable-local-candidate-unpublished', 'durable candidate evidence must remain distinct from an immutable artifact');
assert(manifest.sourceEvidence?.sourceBaseCommit === 'b423c0f8bcd317fd945d6f66ce3fa679401dba7f', 'unexpected final candidate source base commit');
assert(manifest.sourceEvidence?.sourceBranch === 'optimizations', 'unexpected local source branch');
assert(manifest.sourceEvidence?.sourceClean === false, 'uncommitted candidate patch must not claim a clean source tree');
assert(manifest.sourceEvidence?.sourcePushed === false, 'final candidate must not claim to be pushed');
assert(manifest.sourceEvidence?.frozenCandidatePatch === true, 'final candidate must record the frozen candidate patch');
assert(manifest.sourceEvidence?.packageVersion === '0.0.3', 'unexpected local upstream package version');
assert(manifest.sourceEvidence?.publishedImmutableArtifact === false, 'local source must not claim a published immutable artifact');
assert(manifest.sourceEvidence?.pinnedByThisProject === false, 'source-only codec must not claim to be pinned');
assert(manifest.sourceEvidence?.bundledProductionImport === false, 'source-only codec must not claim production integration');
assert(manifest.sourceEvidence?.publicSubpath === '@iroha/iroha-js/transaction-codec', 'unexpected local browser codec subpath');
assert(JSON.stringify(manifest.sourceEvidence?.candidateArtifact) === JSON.stringify({
  name: 'iroha-iroha-js-0.0.3.tgz',
  evidencePath: 'artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f',
  evidenceManifestSha256: '723c46192d369dac939f75d1ef1fb2f82456b3cd6afbd0ac51c0071383871a4d',
  patchSha256: 'b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049',
  sourceBaseTree: 'f5e47336c7ba64f43e629636fd0b0b31ca39a22e',
  evidenceVendored: true,
  ephemeral: false,
  replayable: true,
  sourceReplayRequiresExternalRepository: false,
  baseSourceArchiveBundled: true,
  baseSourceArchiveSha256: 'cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c',
  baseSourceArchiveBytes: 2412361,
  baseSourceArchiveEntries: 305,
  baseSourceInventorySha256: '949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4',
  reconstructedSubsetTree: '04fbf3b60512c7daf734d3f72c6a60ceb79316af',
  baseRepositoryBundled: false,
  offlineCandidateReplayable: true,
  offlineFullSourceReplayable: false,
  exactTarRepackVerified: true,
  files: 154,
  archiveEntries: 154,
  packedBytes: 1281259,
  unpackedBytes: 7914958,
  npmShasumSha1: '8ee3a23653fc4e2648f81dc12ce5cf00d36b4439',
  tarSha256: '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8',
  integrity: 'sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==',
  published: false,
  reviewed: false,
  pinnedByThisProject: false,
  bundledByThisProject: false,
}), 'unexpected final local candidate artifact facts');
assert(JSON.stringify(manifest.sourceEvidence?.upstreamWorkspaceReleaseGates) === JSON.stringify({
  scopedRustFmt: 'passed',
  fullRustWorkspaceCompile: 'passed-with-28-pre-existing-dead-code-warnings',
  cargoFmtAll: 'passed',
}), 'unexpected upstream workspace release-gate facts');
assert(JSON.stringify(manifest.sourceEvidence?.kagemushaV2PolicyClosure) === JSON.stringify({
  toriiCargoCheck: { status: 'passed', errors: 0, existingCoreWarnings: 28, testProfileWarnings: 31 },
  toriiFocused: { passed: 12, failed: 0 },
  coreGlobalOperationId: { passed: 3, failed: 0 },
  javascriptStaticParity: { passed: 76, failed: 0 },
  mainPolicy: 'passed',
  canonicalOpenApi: {
    generatorAndSync: 'passed',
    rootCurrentByteIdentical: true,
    specBytes: 663006,
    sha256: 'd773d734b5baddc20725982874ed7ef76320ab74e4b99402b2a36d4892764ae3',
    blake3: 'e771c3beac43c73b9628c7798b7401631b84508f8cd2fb3edc547124c157f960',
    dirtySourceDigest: '665e6c059696facaadbd84e2f8203dc6aaf2a0bd8d24329e7774e4f0fe6ce36c',
    generatorCommit: null,
    dirty: true,
    signed: false,
    redeemRoute: '503-fail-closed-200-conditional-unreachable-future',
    defaultReleaseVerification: 'rejects-dirty-source',
    developmentVerification: 'passed-with-explicit-allow-unsigned',
    xtask: { passed: 20, failed: 0 },
    portal: { passed: 54, failed: 0 },
    focusedTorii: { passed: 1, failed: 0 },
    ciChecker: 'passed',
  },
  productionCaveat: 'v2-redeem-fail-closed-until-canonical-atomic-operation-receipt-backend',
}), 'unexpected Kagemusha V2 policy-closure facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.browserAndPackageFocused) === JSON.stringify({ passed: 23, failed: 0 }), 'unexpected browser/package focused facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.packageAndTypes) === JSON.stringify({ passed: 5, failed: 0 }), 'unexpected package/type selection facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.affectedRegressionSelection) === JSON.stringify({ passed: 220, failed: 0 }), 'unexpected affected-regression selection facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.packageDistFull) === JSON.stringify({ passed: 132, failed: 0 }), 'unexpected package-dist full-suite facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.localCryptoAdapterGuard) === JSON.stringify({ passed: 8, failed: 0 }), 'unexpected local crypto-adapter guard facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.kagemushaStaticParity) === JSON.stringify({ passed: 76, failed: 0 }), 'unexpected Kagemusha static-parity facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.sourceDistChangedRuntimeParity) === JSON.stringify({ passed: 6, failed: 0 }), 'unexpected changed runtime source/dist parity facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.broaderPackedRuntimeComposition) === JSON.stringify({ passed: 14, failed: 0 }), 'unexpected broader packed runtime-composition facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.finalNodeCommand) === JSON.stringify({
  command: 'node --test',
  total: 2317,
  passed: 2244,
  skipped: 73,
  intentionalSkips: 73,
  failed: 0,
  cancelled: 0,
  todo: 0,
}), 'unexpected final Node command facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.qualityGates) === JSON.stringify({
  eslint: 'passed',
  buildDist: 'passed',
  bundleCheck: 'passed',
  gitDiffCheck: 'passed',
  changelogCheck: 'passed',
  sourceDistPairs: 'changed-runtime-6-of-6-and-broader-packed-14-of-14-byte-identical',
}), 'unexpected JavaScript quality-gate facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.safariRuntimeQa) === JSON.stringify({
  status: 'passed-native-safari-loopback',
  webDriverBindingAvailable: false,
  appleEventJavaScriptAvailable: false,
  readOnlyDocumentTextBridgeAvailable: true,
  remoteAutomationRequired: false,
  appleEventJavaScriptRequired: false,
  realSafariScenarios: 6,
  realSafariAssertions: 91,
  passed: true,
  releaseBlocker: false,
  safariVersion: '26.5.2',
  tarSha256: '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8',
  bundleSha256: 'f7781764f541f2c27b70b36f92bda81cddcad128918de73d67404746474a04ab',
  bundleBytes: 1127726,
  bundleInputs: 79,
  candidatePackageInputs: 39,
  assertionInventorySha256: '31b68d1c57fa6c652ceea255c43952bab43ef294358db31d31a4e03573543572',
  evidencePath: 'artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json',
  evidenceSha256: '02184886d34343924cfe9de378249759fb41b3430d2cd36ec83337955401368a',
  contractAdversarialChecks: 46,
  evidenceAdversarialChecks: 21,
  launcherChecks: 11,
  staticOrNodeRuntimeChecksAreSafariEvidence: false,
}), 'unexpected real Safari runtime QA facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.safari17TargetStaticHarness) === JSON.stringify({
  status: 'passed-static-and-node-runtime-only',
  ephemeral: true,
  replayable: false,
  tarSha256: '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8',
  installedOnlyFinalTarAndEsbuild: true,
  esbuildVersion: '0.28.1',
  publicSubpaths: 18,
  aggregateBytes: 1648973,
  esbuildInputs: 67,
  packageInputs: 28,
  forbiddenNodeInputs: 0,
  staticBufferMutations: 0,
  nodeNamespacesExposed: 18,
  nodeEvaluationStartedWithoutGlobalBuffer: true,
  nodeEvaluationLeftGlobalBufferAbsent: true,
  genericRootExpectedFailureUnresolvedNodeBuiltinEdges: 22,
  realSafariEvidence: false,
}), 'unexpected Safari-target static/Node-runtime harness facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.historicalFrozenCandidateBundleMeasurementsKiB) === JSON.stringify({
  evidenceScope: 'frozen-unpublished-candidate-recorded-2026-07-12',
  esbuildVersion: '0.28.1',
  toriiClient: { measured: '834.7', measuredBytes: 854715, modules: 57, forbiddenNodeInputs: 0, globalBufferAssignments: 0, cap: 840 },
  browserTransactionCodec: { measured: '122.5', measuredBytes: 125424, modules: 36, forbiddenNodeInputs: 0, cap: 132 },
  nexusBrowser: { measured: '201.7', measuredBytes: 206556, modules: 45, forbiddenNodeInputs: 0, cap: 205 },
  canonicalRequest: { measured: '67.9', measuredBytes: 69529, modules: 31, forbiddenNodeInputs: 0, cap: 75 },
  ivmBrowser: { measured: '9.4', measuredBytes: 9644, modules: 7, forbiddenNodeInputs: 0, cap: 12 },
  kotodamaBrowser: { measured: '49.8', measuredBytes: 51000, modules: 6, forbiddenNodeInputs: 0, cap: 51 },
  publicBrowserAggregate: {
    measured: '297.3',
    measuredBytes: 304385,
    modules: 51,
    forbiddenNodeInputs: 0,
    globalBufferAssignments: 0,
    cap: 300,
  },
}), 'unexpected historical frozen-candidate bundle measurements');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.reviewedUpstreamBundleContract) === JSON.stringify({
  reviewedAt: '2026-07-16',
  contractSourceCommit: 'f6f8706977f5b3589ddbaea4d92f0e871b1cbe82',
  esbuildVersion: '0.28.1',
  releaseArtifactEvidence: false,
  nexusBrowser: {
    baselineBytes: 215950,
    baselineKiB: '210.9',
    modules: 46,
    capKiB: 216,
    capBytes: 221184,
    headroomBytes: 5234,
    headroomPercent: '2.42',
    forbiddenNodeInputs: 0,
    globalBufferAssignments: 0,
  },
  publicBrowserAggregate: {
    baselineBytes: 314580,
    baselineKiB: '307.2',
    modules: 52,
    capKiB: 328,
    capBytes: 335872,
    headroomBytes: 21292,
    headroomPercent: '6.77',
    forbiddenNodeInputs: 0,
    globalBufferAssignments: 0,
  },
}), 'unexpected reviewed upstream bundle contract facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.dirtyTreeBundleObservation) === JSON.stringify({
  observedAt: '2026-07-16',
  sourceCommit: '0fcb6a6961b8a15913c73a265a92877f69ceed4b',
  sourceClean: false,
  reviewedBaselineEvidence: false,
  releaseArtifactEvidence: false,
  esbuildVersion: '0.28.1',
  nexusBrowser: {
    observedBytes: 216052,
    modules: 46,
    deltaFromReviewedBaselineBytes: 102,
    underReviewedCap: true,
    forbiddenNodeInputs: 0,
    globalBufferAssignments: 0,
  },
  publicBrowserAggregate: {
    observedBytes: 314735,
    modules: 52,
    deltaFromReviewedBaselineBytes: 155,
    underReviewedCap: true,
    forbiddenNodeInputs: 0,
    globalBufferAssignments: 0,
  },
  fullBundleCheck: {
    status: 'failed-on-unrelated-dirty-torii-cap',
    toriiObservedBytes: 933497,
    toriiCapKiB: 896,
  },
}), 'unexpected dirty-tree bundle observation facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.browserExportGraphValidation) === JSON.stringify({
  uniqueExplicitExportGraphs: 10,
  nodeEdgeGuards: 'passed',
  staticBufferGuards: 'passed',
  runtimeBufferGuards: 'passed',
  forbiddenNodeInputs: 0,
  globalBufferAssignments: 0,
  realSafariEvidence: false,
}), 'unexpected browser export-graph validation facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.dependencyAudits) === JSON.stringify({
  fullVulnerabilities: 0,
  productionVulnerabilities: 0,
}), 'unexpected JavaScript dependency-audit facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.packVerification) === JSON.stringify({
  name: '@iroha/iroha-js',
  version: '0.0.3',
  files: 154,
  archiveEntries: 154,
  packedBytes: 1281259,
  unpackedBytes: 7914958,
  npmShasumSha1: '8ee3a23653fc4e2648f81dc12ce5cf00d36b4439',
  tarSha256: '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8',
  integrity: 'sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==',
}), 'unexpected JavaScript post-prepare pack verification facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.rustDataModel) === JSON.stringify({ passed: 1, failed: 0 }), 'unexpected Rust data-model test facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.rustNapi) === JSON.stringify({ passed: 1, failed: 0 }), 'unexpected Rust N-API test facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.crossLanguageVerification) === JSON.stringify({
  fixtureFamilyEntries: { canonical: 27, android: 27, swift: 27, python: 27 },
  fixtureFamilyFingerprint: 'f4f93f7ca4c6c244130e7bbd5b518df8',
  xtaskNoritoRpcVerify: { verifiedEntries: 27, failed: 0 },
  rustExporter: { passed: 20, failed: 0 },
  rustXtaskUnit: { passed: 17, failed: 0 },
  javascriptFixtureConsumers: { passed: 22, failed: 0 },
  javaQa: { passed: 111, failed: 0 },
  javaExporterEntries: { passed: 27, failed: 0 },
  kotlinSelected: { passed: 14, failed: 0 },
  pythonFixtureSuite: { passed: 47, failed: 0 },
  swiftTransactionParity: { executed: 11, passed: 6, expectedSkips: 5, failed: 0 },
  swiftBroaderChangedCallsites: { executed: 123, passed: 89, expectedSkips: 34, failed: 0 },
  swiftValidationFeeFocused: { passed: 5, failed: 0 },
  swiftIndependentQaSeam: { passed: 3, failed: 0 },
  swiftBridgeAbi: { artifact: 8, minimum: 14, source: 17 },
  bridgeAbi17Parity: {
    proofSymbols: 6,
    protocolSymbols: 15,
    totalSymbols: 21,
    rustInventory: 21,
    cHeaderInventory: 21,
    swiftInventory: 21,
    exactRustCSignatures: 21,
    freeSymbolExactAcrossRustCAndSwift: true,
    headerPositive: { passed: 1, failed: 0 },
    headerNegativeControls: { passed: 15, failed: 0 },
    javascriptParity: { passed: 76, failed: 0 },
    swiftV2: { passed: 3, failed: 0 },
  },
  alignmentMismatches: 0,
  intentionalAlignmentOmissions: [],
}), 'unexpected cross-language verification facts');
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.sharedVectorLanguages) === JSON.stringify(['rust', 'javascript', 'kotlin', 'java', 'swift', 'python']), 'unexpected shared-vector language coverage');
const expectedModes = [
  'native-payload-and-prehash-parity',
  'native-finalizer-and-pipeline-hash-parity',
  'package-subpath-tarball-and-typescript-surface',
  'cross-language-compact-framing-and-hasher-contract',
  'strict-ed25519-canonical-points-small-order-and-mixed-torsion-rejection',
  'unicode-scalar-control-and-rust-plain-json-escaping-parity',
  'exact-canonical-raw-metadata-json-and-duplicate-key-rejection',
  'dense-data-only-metadata-and-accessor-prototype-rejection',
  'bounds-before-bigint-utf8-decode-and-byte-copy',
  'defensive-buffer-arraybuffer-sharedarraybuffer-snapshots',
  'nexus-payload-and-transaction-hash-recomputation-and-alias-conflict-rejection',
  'browser-only-nexus-fetch-transport-and-explicit-buffer-import',
  'descriptor-snapshots-and-exact-field-allowlists-at-nexus-boundaries',
  'signer-prevalidation-confused-deputy-alias-conflict-and-side-effect-ordering',
  'packed-browser-declarations-without-ambient-node-types',
  'public-browser-aggregate-node-free-graph-and-local-crypto-adapter',
  'canonical-request-webcrypto-nonce-ed25519-exact-message-and-strict-dom-types',
  'four-family-exact-fixture-alignment-and-pre-map-identity-rejection',
  'enforced-pinned-esbuild-bundle-size-gates',
  'source-dist-byte-identity',
  'negative-and-adversarial-rejection',
];
assert(JSON.stringify(manifest.sourceEvidence?.focusedTests?.modes) === JSON.stringify(expectedModes), 'unexpected local source validation modes');
const vector = manifest.sourceEvidence?.sharedVector;
assert(vector?.sourceTag === 'v2.0.0-rc.2.1-fearless-mobile-sdk.3', 'unexpected shared-vector source tag');
assert(vector?.sourceCommit === '4f8cfbdd17aa6a3b049e619f23ec02501e5297b6', 'unexpected shared-vector source commit');
assert(vector?.versionedBytes === 565 && vector?.bareBytes === 564, 'unexpected shared-vector byte lengths');
assert(vector?.versionedSha256 === '73dd9a04a34c0acb5c4b44021389bd06910a60eeab05936c3afe425aa5374c7e', 'unexpected shared-vector SHA-256');
assert(vector?.payloadPrehash === 'e673f611d9d42b02f5c1ff55ec6c2133c51b9a20be1f4eaa84f32ed9ffb2c395', 'unexpected shared-vector payload prehash');
assert(vector?.compactLengthHex === 'b404' && vector?.canonicalPrefixHex === '00000000b404', 'unexpected compact framing vector');
assert(vector?.canonicalHash === '2332d0004eb24d97fd965fe68f6f31b0e51339764b4dd80f3ea50a3b6f7e5003', 'unexpected canonical transaction hash');
assert(vector?.fixedWidthDefectiveHash === '2b5e69a0a3d333756f4ac2a54bf7eaff88a2c87484d89e6e7da98abea659662d', 'unexpected defective fixed-width hash sentinel');
assert(manifest.blocker?.code === 'browser_transaction_codec_unpublished_source_only', 'unexpected blocker code');
assert(manifest.blocker?.testOnlyRuntimeSeam === 'globalThis.__IROHA_NATIVE_BINDING__', 'unexpected test-only runtime seam');
assert(manifest.blocker?.reason.includes('source base b423c0f8bcd317fd945d6f66ce3fa679401dba7f plus a frozen candidate patch'), 'blocker must acknowledge the exact final candidate source');
assert(manifest.blocker?.reason.includes('15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8'), 'blocker must acknowledge the exact final candidate digest');
assert(manifest.blocker?.reason.includes('durably vendored as exact evidence'), 'blocker must acknowledge durable evidence without claiming publication');
assert(manifest.blocker?.reason.includes('not pushed, independently reviewed, published as an immutable release artifact'), 'blocker must distinguish the local candidate from immutable artifacts');
assert(manifest.blocker?.reason.includes('checksum-pinned as the production dependency'), 'blocker must require production dependency pinning');
assert(manifest.blocker?.reason.includes('Native Safari 26.5.2 separately passed 6 scenarios and 91 assertions'), 'blocker must preserve exact native Safari evidence');
assert(manifest.blocker?.reason.includes('closes only the local Safari runtime gate'), 'blocker must not overstate native Safari evidence');
assert(manifest.blocker?.reason.includes('Production send remains disabled'), 'blocker must preserve production non-enablement');
const expectedLiveGates = [
  'reviewed_immutable_codec_artifact',
  'taira_live_asset_resolution',
  'nexus_live_asset_resolution',
  'live_fee_balance_preflight',
  'production_node_capability_tls',
  'funded_taira_broadcast_evidence',
  'funded_nexus_broadcast_evidence',
];
assert(Array.isArray(manifest.liveGates) && manifest.liveGates.length === expectedLiveGates.length, 'exactly seven live gates are required');
assert(JSON.stringify(manifest.liveGates.map((gate) => gate.code)) === JSON.stringify(expectedLiveGates), 'unexpected live gate order or code');
assert(manifest.liveGates.every((gate) => typeof gate.reason === 'string' && gate.reason.length >= 40), 'each live gate requires an explicit reason');
const expectedExitCriteria = [
  'publish-a-reviewed-immutable-browser-transaction-codec-release-artifact',
  'pin-audit-and-bundle-the-transaction-codec-subpath-without-a-runtime-global',
  'rerun-shared-golden-parity-and-adversarial-tests-against-the-pinned-artifact',
  'complete-live-asset-fee-balance-node-and-status-preflight-for-taira-and-nexus',
  'record-funded-taira-and-nexus-live-broadcast-evidence-before-enablement',
];
assert(JSON.stringify(manifest.exitCriteria) === JSON.stringify(expectedExitCriteria), 'unexpected exit criteria');
NODE

(cd "$ROOT_DIR" && bash "$CANDIDATE_VERIFIER" --bundle-dir "$CANDIDATE_EVIDENCE" --replay-source) >/dev/null
node "$SAFARI_QA_EVIDENCE_VERIFIER" "$SAFARI_QA_EVIDENCE" >/dev/null
[[ "$(sha256_file "$SAFARI_QA_EVIDENCE")" == "02184886d34343924cfe9de378249759fb41b3430d2cd36ec83337955401368a" ]] ||
  fail "stored native Safari QA evidence digest mismatch"
for marker in \
  'SAFARI_QA_BUNDLE_SHA256' \
  'SAFARI_QA_ASSERTION_INVENTORY_SHA256' \
  'parseAndValidateSafariQaReportText' \
  'waitForSafariQaReport' \
  'document text exceeds' \
  'report JSON must use exact canonical JSON serialization'; do
  require_fixed "$SAFARI_QA_CONTRACT" "$marker" "Safari QA contract marker '$marker'"
done
for marker in \
  "server.listen(0, '127.0.0.1'" \
  'request.headers.host !== hostHeader' \
  "remote !== '127.0.0.1'" \
  "runAppleScript('close', qaUrl, safariWindowId)" \
  'exact-iroha-candidate-resolver' \
  'Safari bundle digest mismatch' \
  'Content-Security-Policy' \
  "randomBytes(32).toString('hex')"; do
  require_fixed "$SAFARI_QA_RUNNER" "$marker" "native Safari QA runner marker '$marker'"
done
for marker in \
  'text of current tab of qaWindow' \
  'Safari did not create exactly one isolated QA window' \
  'owned Safari QA window URL changed'; do
  require_fixed "$SAFARI_QA_CONTROL" "$marker" "native Safari read-only control marker '$marker'"
done
grep -Fq 'do JavaScript' "$SAFARI_QA_CONTROL" &&
  fail "native Safari QA control must not execute Apple-event JavaScript"
for marker in \
  'nonce mismatch' \
  'origin hostname tamper' \
  'candidate digest tamper' \
  'bundle digest tamper' \
  'malformed JSON' \
  'oversized report' \
  'report polling timeout'; do
  require_fixed "$SAFARI_QA_CONTRACT_TEST" "$marker" "Safari QA adversarial marker '$marker'"
done
for marker in \
  'impossible calendar timestamp' \
  'impossible hour timestamp' \
  'future observation timestamp' \
  'report digest tamper' \
  'report nonce tamper' \
  'report origin tamper' \
  'report assertion tamper'; do
  require_fixed "$SAFARI_QA_EVIDENCE_TEST" "$marker" "Safari evidence adversarial marker '$marker'"
done
for marker in \
  'unsafe runtime environment variable is set' \
  'symlinked path component is forbidden' \
  'candidate manifest digest mismatch' \
  'candidate patch digest mismatch' \
  'candidate tar digest mismatch' \
  'historical candidate unexpectedly satisfies current SDK policy' \
  'current SDK policy rejection changed' \
  'offline historical evidence and current-policy rejection verification passed' \
  'verify-iroha-js-base-source-archive.mjs' \
  'exact source replay and byte-identical repack passed'; do
  require_fixed "$CANDIDATE_VERIFIER" "$marker" "durable candidate verifier marker '$marker'"
done
for marker in \
  'symlinked bundle ancestor' \
  'patch path traversal' \
  'base source archive path traversal' \
  'base source archive symlink entry' \
  'base source archive extra file' \
  'base source archive missing file' \
  'base source archive commit mismatch' \
  'base source archive tree mismatch' \
  'offline replay is portable outside both working repositories' \
  'NODE_OPTIONS preload' \
  'caller PATH hijack is ignored' \
  'ambient Git configuration and parameter injection is ignored' \
  'corrupted generated sidecar changes exact offline repack'; do
  require_fixed "$CANDIDATE_VERIFIER_TEST" "$marker" "durable candidate adversarial marker '$marker'"
done
require_fixed "$CANDIDATE_VERIFIER_TEST" \
  'canonical historical evidence and current-policy rejection verification' \
  'durable candidate current-policy supersession test'
for marker in \
  'base source archive digest mismatch' \
  'base source archive commit mismatch' \
  'base source archive commit/tree metadata mismatch' \
  'archive contains a link or special-file entry' \
  'archive path contains an unsafe segment' \
  'base source archive differs from its exact file inventory' \
  'decompression failed or exceeded its bounded output'; do
  require_fixed "$BASE_ARCHIVE_VERIFIER" "$marker" "base source archive verifier marker '$marker'"
done

vendored_sdk_bytes="$(wc -c < "$VENDORED_SDK_TARBALL" | tr -d '[:space:]')"
[[ "$vendored_sdk_bytes" == "$SDK_TARBALL_BYTES" ]] ||
  fail "vendored Iroha SDK tarball byte count mismatch"
[[ "$(sha256_file "$VENDORED_SDK_TARBALL")" == "$SDK_TARBALL_SHA256" ]] ||
  fail "vendored Iroha SDK tarball digest mismatch"
require_fixed "$VENDORED_SDK_AUDIT" \
  'this audit accepts no path or digest overrides' \
  'vendored Iroha SDK audit override guard'
require_fixed "$VENDORED_SDK_AUDIT" \
  "export const VENDORED_IROHA_ARCHIVE_SHA256" \
  'vendored Iroha SDK exact digest policy'
require_fixed "$VENDORED_SDK_AUDIT" \
  "const FORBIDDEN_EXPORTS = ['./ivm-artifact', './transaction-codec']" \
  'vendored Iroha SDK blocked-send export policy'

node - "$PACKAGE_JSON" "$SDK_DEPENDENCY" <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (pkg.dependencies?.['@iroha/iroha-js'] !== process.argv[3]) {
  console.error('[iroha-send-readiness][web][error] @iroha/iroha-js is not pinned to the reviewed vendored artifact');
  process.exit(1);
}
if (pkg.scripts?.['audit:vendored-iroha-sdk'] !== 'node scripts/audit-vendored-iroha-js-sdk.mjs') {
  console.error('[iroha-send-readiness][web][error] vendored Iroha SDK audit script is not exact');
  process.exit(1);
}
if (pkg.scripts?.['test:vendored-iroha-sdk-audit'] !== 'node scripts/test-vendored-iroha-js-sdk-audit.mjs') {
  console.error('[iroha-send-readiness][web][error] vendored Iroha SDK audit self-test script is not exact');
  process.exit(1);
}
if (pkg.devDependencies?.['@scure/bip39'] !== '2.2.0') {
  console.error('[iroha-send-readiness][web][error] Safari QA bip39 dependency is not exactly pinned');
  process.exit(1);
}
if (pkg.scripts?.['test:iroha-safari-qa'] !== 'bash scripts/test-iroha-js-candidate-safari-qa.sh') {
  console.error('[iroha-send-readiness][web][error] Safari QA contract self-test script is not exact');
  process.exit(1);
}
if (pkg.scripts?.['qa:iroha-safari'] !== 'bash scripts/run-iroha-js-candidate-safari-qa.sh') {
  console.error('[iroha-send-readiness][web][error] native Safari QA launcher script is not exact');
  process.exit(1);
}
NODE
require_fixed "$LOCKFILE" \
  '"@iroha/iroha-js@file:vendor/iroha-js/iroha-iroha-js-0.0.2.tgz::locator=fearless-wallet%40workspace%3A.":' \
  "Iroha SDK lockfile descriptor"
require_fixed "$LOCKFILE" \
  'resolution: "@iroha/iroha-js@file:vendor/iroha-js/iroha-iroha-js-0.0.2.tgz#vendor/iroha-js/iroha-iroha-js-0.0.2.tgz::hash=c60602&locator=fearless-wallet%40workspace%3A."' \
  "Iroha SDK lockfile resolution"
require_fixed "$LOCKFILE" \
  'checksum: 10/d9800e8065da8ccb5c27dbea439e51ae14569527c5722e3bfa4bdabd8050101b3aad90cc1269e498e1f2cd50db23e599c76dca77beaba259d3bc073a0f1d6662' \
  "Iroha SDK Yarn content checksum"
require_fixed "$LOCKFILE" '"@scure/bip39@npm:2.2.0"' "Safari QA bip39 lock resolution"
require_fixed "$LOCKFILE" \
  'checksum: 10/f8f05c9f1337f694e1b490dcc795ac0da87e3cb4e5377889c19caa910c46567aa6b4071f2fc102fffb76020c221e09ffe9e1dde471728224335713c55cbfb182' \
  "Safari QA bip39 lock checksum"

if [[ -n "${VUE_APP_ENABLE_IROHA_TRANSFERS:-}" && "${VUE_APP_ENABLE_IROHA_TRANSFERS}" != "false" ]]; then
  fail "VUE_APP_ENABLE_IROHA_TRANSFERS must remain false until a reviewed immutable browser codec artifact is published, pinned, and bundled"
fi

while IFS= read -r -d '' env_file; do
  env_state="$(node - "$env_file" <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
let state = 'missing';

for (const rawLine of source.split(/\r?\n/u)) {
  const match = rawLine.match(/^\s*(?:export\s+)?VUE_APP_ENABLE_IROHA_TRANSFERS\s*=\s*(.*?)\s*$/u);
  if (!match) continue;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  } else {
    value = value.replace(/\s+#.*$/u, '').trim();
  }
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) state = 'enabled';
  else if (normalized === '' || normalized === 'false') state = 'disabled';
  else state = `invalid:${value}`;
}

process.stdout.write(state);
NODE
)"
  if [[ "$env_state" == "enabled" ]]; then
    fail "Iroha transfers are enabled in ${env_file#"$ROOT_DIR/"} while browser codec readiness is blocked"
  fi
  [[ "$env_state" != invalid:* ]] || fail "invalid Iroha transfer flag in ${env_file#"$ROOT_DIR/"}: ${env_state#invalid:}"
done < <(find "$ROOT_DIR" -maxdepth 1 -type f -name '.env*' -print0)

require_fixed "$PRODUCTION_CODEC" \
  "if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS !== 'true') return undefined;" \
  "release flag gate"
require_fixed "$PRODUCTION_CODEC" \
  'const binding = (globalThis as IrohaBrowserGlobal).__IROHA_NATIVE_BINDING__;' \
  "explicit unavailable browser codec seam"
require_fixed "$BUILD_CONFIG" \
  "if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true')" \
  "all-build-mode fail-closed gate"
require_fixed "$BUILD_CONFIG" \
  'browser_transaction_codec_unpublished_source_only: local browser codec source is not a reviewed immutable release artifact' \
  "all-build-mode blocker error"
require_fixed "$TRANSFER_TEST" \
  "it('fails closed while Iroha transfers are not release-enabled'" \
  "disabled-release test"
require_fixed "$TRANSFER_TEST" \
  "it('fails closed when transfers are enabled but no reviewed bundled Iroha transaction codec artifact is configured'" \
  "unpublished-artifact fail-closed test"
require_fixed "$TRANSFER_TEST" \
  "it('exercises the global transaction host only as an isolated test seam'" \
  "test-only global seam test"
require_fixed "$TRANSFER_TEST" \
  "it('rejects Nexus SDK signing when the stored mnemonic does not match the account public key'" \
  "key-mismatch adversarial test"
require_fixed "$EXTENSION_HANDLER" \
  "import { requireProductionIrohaTransferCodec } from '@extension-base/api/iroha/productionTransferCodec';" \
  "production codec loader import"
require_fixed "$EXTENSION_HANDLER" \
  'transferProm = requireProductionIrohaTransferCodec().then((codec) =>' \
  "production codec loader routing"

node - "$EXTENSION_HANDLER" <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const routeBranches = source.match(/else if \(isIrohaTransferNetwork\(network\)\)/g) ?? [];
const loaderCalls = source.match(/\brequireProductionIrohaTransferCodec\s*\(\s*\)/g) ?? [];
const expected = `transferProm = requireProductionIrohaTransferCodec().then((codec) =>
        makeIrohaTransfer(`;

if (routeBranches.length !== 1 || loaderCalls.length !== 1 || !source.includes(expected)) {
  console.error('[iroha-send-readiness][web][error] extension send routing must use exactly one audited production codec loader');
  process.exit(1);
}
NODE

loader_files="$(
  find "$ROOT_DIR/src" -type f -exec grep -Il 'requireProductionIrohaTransferCodec' {} + | sort
)"
expected_loader_files="$(printf '%s\n%s\n' "$PRODUCTION_CODEC" "$EXTENSION_HANDLER" | sort)"
[[ "$loader_files" == "$expected_loader_files" ]] || {
  printf '%s\n' "$loader_files" >&2
  fail "the production codec loader appeared outside its audited loader and send-handler paths"
}

global_files="$(find "$ROOT_DIR/src" -type f -exec grep -Il '__IROHA_NATIVE_BINDING__' {} + | sort || true)"
[[ "$global_files" == "$PRODUCTION_CODEC" ]] || {
  printf '%s\n' "$global_files" >&2
  fail "the native binding seam appeared outside the single audited codec loader"
}
source_symlink="$(find "$ROOT_DIR/src" -type l -print -quit)"
[[ -z "$source_symlink" ]] || fail "production source tree contains a symlink: ${source_symlink#"$ROOT_DIR/"}"
if grep -REn '__IROHA_NATIVE_BINDING__[[:space:]]*=' "$ROOT_DIR/src" >"$TMP_MATCHES" 2>/dev/null; then
  cat "$TMP_MATCHES" >&2
  fail "production source initializes the unreviewed native binding global"
fi
: > "$TMP_MATCHES"

if grep -REn \
  '@iroha/iroha-js/transaction-codec|buildBrowserTransferPayload|browserTransactionCodec' \
  "$ROOT_DIR/src" >"$TMP_MATCHES" 2>/dev/null; then
  cat "$TMP_MATCHES" >&2
  fail "the unpublished source-only browser codec was integrated into production source"
fi
: > "$TMP_MATCHES"

node - "$REGISTRY" <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('nexus: {');
const end = source.indexOf('\n  },', start);
if (start < 0 || end < 0 || !source.slice(start, end).includes('enabledByDefault: false')) {
  console.error('[iroha-send-readiness][web][error] Nexus registry default is not provably disabled');
  process.exit(1);
}
NODE

tracked_codec_binary="$(git -C "$ROOT_DIR" ls-files | grep -E '[.](wasm|node|so|dylib|a)$' || true)"
[[ -z "$tracked_codec_binary" ]] || {
  printf '%s\n' "$tracked_codec_binary" >&2
  fail "an Iroha native/WASM codec artifact was tracked without a reviewed pinned release artifact"
}

for marker in \
  "expectContains('dist/native.browser.js', 'iroha_js_host is unavailable in browser builds')" \
  'const hasBrowserTransactionCodec' \
  "assertBrowserOnlyRelativeModuleGraph('dist/nexusApp.js');" \
  'assertBrowserPackageModuleGraph' \
  'function snapshotDataFields' \
  'const SIGNABLE_FIELDS = new Set' \
  'const CONFIG_FIELDS = new Set' \
  'const TRANSFER_DRAFT_FIELDS = new Set' \
  'const FINALIZE_OPTION_FIELDS = new Set' \
  'const CONNECT_OPTION_FIELDS = new Set' \
  'const CONNECT_SESSION_FIELDS = new Set' \
  'const APPROVAL_FIELDS = new Set' \
  'credentials: "omit"' \
  'redirect: "error"' \
  'referrerPolicy: "no-referrer"' \
  'browser Nexus source and generated dist entry must be byte-identical' \
  'browser SHA-256 shim source and generated dist entry must be byte-identical' \
  'local Node crypto adapter source and generated dist entry must be byte-identical' \
  'canonical request source and generated dist entry must be byte-identical' \
  'package.json browser map must replace the local crypto adapter' \
  'package.json browser map must not replace Node builtins globally' \
  'nexus-app.d.ts must not depend on ambient Node types' \
  'canonical-request.d.ts must not depend on ambient Node types' \
  'package.json bundle:check must execute the enforced bundle-size gate' \
  'Nexus native import restored' \
  'Nexus global Buffer dependency' \
  'Nexus browser bundle cap weakened' \
  'Nexus browser legacy 205 KiB cap restored' \
  'Nexus browser reviewed baseline drift' \
  'public aggregate local crypto map removed' \
  'global node:crypto browser map restored' \
  'canonical request browser bundle cap weakened' \
  'canonical request source/dist drift' \
  'local crypto adapter source/dist drift' \
  'public aggregate forbidden Node edge restored' \
  'public aggregate browser bundle cap weakened' \
  'public aggregate legacy 300 KiB cap restored' \
  'public aggregate reviewed baseline drift' \
  'browser SHA-256 shim source/dist drift' \
  'aggregate normalizers source/dist drift' \
  'aggregate node:buffer edge restored'; do
  require_fixed "$SDK_CHECKER" "$marker" "SDK browser-blocker validation marker '$marker'"
done

for marker in \
  'BLOCKED / fail closed' \
  'v2.0.0-rc.2.1-fearless-mobile-sdk.3' \
  '68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339' \
  '1843179' \
  'browser_transaction_codec_unpublished_source_only' \
  'b423c0f8bcd317fd945d6f66ce3fa679401dba7f' \
  '@iroha/iroha-js/transaction-codec' \
  'durably preserved as' \
  'artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f' \
  '723c46192d369dac939f75d1ef1fb2f82456b3cd6afbd0ac51c0071383871a4d' \
  'b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049' \
  'candidate itself is now entirely replayable offline' \
  'adversarial suite passes 40 checks' \
  'cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c' \
  '949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4' \
  '04fbf3b60512c7daf734d3f72c6a60ceb79316af' \
  '154 package files and 154 archive entries' \
  '1,281,259 packed bytes and 7,914,958 unpacked bytes' \
  '8ee3a23653fc4e2648f81dc12ce5cf00d36b4439' \
  '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8' \
  'sha512-D/B55Y6GWQGsiBjy07PUbUOzSb8+zBRYgutNew8Wb3kJxMjahxHYOvcHbTBln1kOcgKogn/eCnQ/CC6iYrwStA==' \
  'The final `node --test` command executed 2,317 tests: 2,244 passed, 73' \
  'intentional skips, and zero failed, cancelled, or todo' \
  'For the frozen unpublished candidate recorded on 2026-07-12' \
  'Torii: 854,715 bytes, 57 modules, cap 840 KiB' \
  'browser transaction codec: 125,424 bytes, 36 modules, cap 132 KiB' \
  'browser Nexus: 206,556 bytes, 45 modules, cap 205 KiB' \
  'canonical request: 69,529 bytes, 31 modules, cap 75 KiB' \
  'browser IVM: 9,644 bytes, 7 modules, cap 12 KiB' \
  'browser Kotodama: 51,000 bytes, 6 modules, cap 51 KiB' \
  'public browser aggregate: 304,385 bytes, 51 modules, cap 300 KiB' \
  'All ten unique explicit browser export graphs passed forbidden-Node-edge' \
  'current upstream reviewed bundle contract is newer and is recorded' \
  'f6f8706977f5b3589ddbaea4d92f0e871b1cbe82' \
  'browser Nexus: reviewed baseline 215,950 bytes, 46 modules, exact 216 KiB' \
  'public browser aggregate: reviewed baseline 314,580 bytes, 52 modules,' \
  'exact 328 KiB (335,872-byte) cap, 21,292 bytes (6.77%) headroom' \
  'not evidence' \
  'dirty upstream working tree' \
  '0fcb6a6961b8a15913c73a265a92877f69ceed4b' \
  'measured browser Nexus at 216,052' \
  'public browser aggregate at 314,735 bytes / 52' \
  'not reviewed-baseline or release-artifact evidence' \
  'unrelated Torii bundle at 933,497 bytes against its 896' \
  'None of these observations changes the **BLOCKED / fail closed**' \
  'A fresh ephemeral, non-replayable clean harness installed only the exact final' \
  'aggregate of all 18 public subpaths was 1,648,973 bytes with 67 esbuild inputs' \
  'all 18 namespaces, and left `Buffer` absent' \
  'failed browser bundling with 22 unresolved Node-builtin edges' \
  '6 real Safari scenarios and 91 real Safari assertions' \
  'WebDriver remote automation and Apple-event JavaScript both remained' \
  'f7781764f541f2c27b70b36f92bda81cddcad128918de73d67404746474a04ab' \
  '31b68d1c57fa6c652ceea255c43952bab43ef294358db31d31a4e03573543572' \
  '02184886d34343924cfe9de378249759fb41b3430d2cd36ec83337955401368a' \
  'report contract passes 46 adversarial checks' \
  'stored-evidence verifier' \
  'closes only the local browser-runtime gate' \
  'Strict uncofactored Ed25519 verification' \
  'bounds before BigInt conversion, UTF-8 decoding, or byte copying' \
  'exact canonical metadata JSON strings' \
  'canonical, Android, Swift, and Python fixture families contain exactly 27 entries each' \
  'f4f93f7ca4c6c244130e7bbd5b518df8' \
  'exporter 20/20 and xtask unit 17/17' \
  'Java QA 111/111 plus 27 exported entries' \
  'Python fixture result 47/47' \
  'frozen candidate evidence below covers source ABI 17; the current upstream working source is ABI 20' \
  'JavaScript parity passed 76/76, and the focused Swift V2 slice passed 3/3' \
  'Fixture alignment reported zero mismatches' \
  '73dd9a04a34c0acb5c4b44021389bd06910a60eeab05936c3afe425aa5374c7e' \
  'e673f611d9d42b02f5c1ff55ec6c2133c51b9a20be1f4eaa84f32ed9ffb2c395' \
  '2332d0004eb24d97fd965fe68f6f31b0e51339764b4dd80f3ea50a3b6f7e5003' \
  '2b5e69a0a3d333756f4ac2a54bf7eaff88a2c87484d89e6e7da98abea659662d' \
  'zero-fee placeholder' \
  'funded, status-confirmed Taira and Nexus broadcasts' \
  'iroha_js_host is unavailable in browser builds.' \
  'Passing it does **not** make Iroha send production-ready'; do
  require_fixed "$DOC" "$marker" "pinned blocker evidence marker '$marker'"
done
for marker in \
  'b423c0f8bcd317fd945d6f66ce3fa679401dba7f' \
  'artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f' \
  'This path is not a `package.json` dependency or production-loader import' \
  'adversarial verifier passes 40 checks' \
  'requires no live checkout or Git/network access' \
  'cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c' \
  '949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4' \
  '04fbf3b60512c7daf734d3f72c6a60ceb79316af' \
  '2,317 total / 2,244 passed / 73 intentional skips / 0 failed / 0 cancelled / 0 todo' \
  '154 files and 154 archive entries, 1,281,259 packed bytes, 7,914,958 unpacked bytes' \
  '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8' \
  'Historical frozen-candidate bundle (recorded 2026-07-12)' \
  'Torii 854,715 bytes / 57 modules / cap 840 KiB' \
  'public aggregate 304,385 bytes / 51 modules / cap 300 KiB' \
  'All ten unique explicit browser export graphs passed Node-edge, static-Buffer, and runtime-Buffer guards' \
  'Preserve these as historical evidence; they are not the current upstream cap contract' \
  'Current upstream reviewed bundle contract (not immutable release-artifact evidence)' \
  '215,950-byte / 46-module baseline under an exact 216 KiB cap' \
  '314,580-byte / 52-module baseline under an exact 328 KiB cap' \
  'Dirty-tree observation (not reviewed-baseline or release-artifact evidence)' \
  'browser Nexus at 216,052 bytes / 46 modules' \
  'public aggregate at 314,735 bytes / 52 modules' \
  'unrelated Torii at 933,497 bytes against 896 KiB' \
  'Production status remains blocked' \
  '6 real Safari scenarios / 91 real Safari assertions / 0 failures' \
  'required neither WebDriver remote automation nor Apple-event JavaScript' \
  '1,127,726-byte / 79-input / 39-candidate-input bundle' \
  'contract/evidence/launcher negative checks pass 46/18/11' \
  'older 1,648,973-byte static harness remains non-Safari compatibility evidence' \
  'no custom hasher bypass is accepted' \
  'four exact 27-entry families with fingerprint `f4f93f7ca4c6c244130e7bbd5b518df8`' \
  'Frozen-candidate ABI-17 parity proves exact 6-proof/15-protocol inventories across Rust/C/Swift'; do
  require_fixed "$RELEASE_CHECKLIST" "$marker" "release-checklist source-evidence marker '$marker'"
done
require_fixed "$UNIVERSAL_DOC" \
  "Iroha \`features: ['transfer']\` is capability metadata, not a production-send" \
  "Universal Wallet non-enablement statement"
require_fixed "$UNIVERSAL_DOC" \
  '`config/iroha-production-send-readiness.json`' \
  "Universal Wallet readiness manifest reference"

echo "[iroha-send-readiness][web] blocked state is explicit and fail-closed invariants passed."
