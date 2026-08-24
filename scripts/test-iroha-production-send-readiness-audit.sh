#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${IROHA_SEND_AUDIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))}"
AUDIT="$ROOT_DIR/scripts/audit-iroha-production-send-readiness.sh"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fearless-web-iroha-send.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "[iroha-send-readiness-test][web][error] $*" >&2
  exit 1
}

new_fixture() {
  local name="$1"
  local fixture="$TMP_DIR/$name"
  mkdir -p \
    "$fixture/config" "$fixture/docs" "$fixture/scripts" "$fixture/tests/unit" \
    "$fixture/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f" \
    "$fixture/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8" \
    "$fixture/vendor/iroha-js" \
    "$fixture/src/consts" \
    "$fixture/src/extension/background/extension-base/src/api/iroha" \
    "$fixture/src/extension/background/extension-base/src/background/handlers"
  cp "$ROOT_DIR/config/iroha-production-send-readiness.json" "$fixture/config/"
  cp "$ROOT_DIR/docs/iroha-production-send-readiness.md" "$fixture/docs/"
  cp "$ROOT_DIR/docs/release-checklist.md" "$fixture/docs/"
  cp "$ROOT_DIR/docs/universal-wallet-v2.md" "$fixture/docs/"
  cp "$ROOT_DIR/scripts/check-iroha-js-sdk-artifact.sh" "$fixture/scripts/"
  cp "$ROOT_DIR/scripts/audit-vendored-iroha-js-sdk.mjs" "$fixture/scripts/"
  cp "$ROOT_DIR/scripts/verify-iroha-js-candidate.sh" \
    "$ROOT_DIR/scripts/test-iroha-js-candidate-verifier.sh" \
    "$ROOT_DIR/scripts/verify-iroha-js-base-source-archive.mjs" "$fixture/scripts/"
  cp \
    "$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-contract.mjs" \
    "$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-entry.mjs" \
    "$ROOT_DIR/scripts/iroha-js-candidate-safari-qa-suite.mjs" \
    "$ROOT_DIR/scripts/run-iroha-js-candidate-safari-qa.mjs" \
    "$ROOT_DIR/scripts/run-iroha-js-candidate-safari-qa.sh" \
    "$ROOT_DIR/scripts/iroha-js-candidate-safari-control.applescript" \
    "$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa.sh" \
    "$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-contract.mjs" \
    "$ROOT_DIR/scripts/verify-iroha-js-candidate-safari-qa-evidence.mjs" \
    "$ROOT_DIR/scripts/test-iroha-js-candidate-safari-qa-evidence.mjs" \
    "$fixture/scripts/"
  cp "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/README.md" \
    "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/candidate.json" \
    "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/b423c0f8-to-final-candidate.patch" \
    "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/iroha-iroha-js-0.0.3.tgz" \
    "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/b423c0f8-iroha-js-candidate-replay-base.tar.gz" \
    "$ROOT_DIR/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/b423c0f8-iroha-js-candidate-replay-base.inventory.tsv" \
    "$fixture/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/"
  cp "$ROOT_DIR/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json" \
    "$fixture/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/"
  cp "$ROOT_DIR/package.json" "$ROOT_DIR/yarn.lock" "$fixture/"
  cp "$ROOT_DIR/vendor/iroha-js/iroha-iroha-js-0.0.2.tgz" "$fixture/vendor/iroha-js/"
  cp "$ROOT_DIR/vite.config.shared.mjs" "$fixture/"
  cp "$ROOT_DIR/.env.example" "$fixture/"
  cp "$ROOT_DIR/src/consts/universalWallet.ts" "$fixture/src/consts/"
  cp "$ROOT_DIR/src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts" \
    "$ROOT_DIR/src/extension/background/extension-base/src/api/iroha/transfer.ts" \
    "$fixture/src/extension/background/extension-base/src/api/iroha/"
  cp "$ROOT_DIR/src/extension/background/extension-base/src/background/handlers/Extension.ts" \
    "$fixture/src/extension/background/extension-base/src/background/handlers/"
  cp "$ROOT_DIR/tests/unit/iroha-background-transfer.spec.ts" "$fixture/tests/unit/"
  (
    cd "$fixture"
    git init -q
    git add .
  )
  printf '%s' "$fixture"
}

run_audit() {
  IROHA_SEND_AUDIT_ROOT="$1" bash "$AUDIT"
}

expect_failure() {
  local label="$1"
  local fixture="$2"
  local expected="$3"
  shift 3
  local output status
  set +e
  output="$(env "$@" IROHA_SEND_AUDIT_ROOT="$fixture" bash "$AUDIT" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    fail "$label unexpectedly passed"
  fi
  [[ "$output" == *"$expected"* ]] || {
    printf '%s\n' "$output" >&2
    fail "$label did not report expected marker: $expected"
  }
}

mutate_manifest_field() {
  local fixture="$1"
  local dotted_path="$2"
  local json_value="$3"
  node - "$fixture/config/iroha-production-send-readiness.json" "$dotted_path" "$json_value" <<'NODE'
const fs = require('node:fs');
const [file, dottedPath, encodedValue] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const segments = dottedPath.split('.');
const key = segments.pop();
let target = manifest;
for (const segment of segments) {
  if (!target || typeof target !== 'object' || !(segment in target)) process.exit(2);
  target = target[segment];
}
if (!target || typeof target !== 'object' || !(key in target)) process.exit(2);
target[key] = JSON.parse(encodedValue);
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

expect_semantic_manifest_failure() {
  local label="$1"
  local fixture="$2"
  local expected="$3"
  local audit_copy="$fixture/scripts/audit-iroha-production-send-readiness.sh"
  local digest output status

  cp "$AUDIT" "$audit_copy"
  digest="$(shasum -a 256 "$fixture/config/iroha-production-send-readiness.json" | awk '{print $1}')"
  node - "$audit_copy" "$digest" <<'NODE'
const fs = require('node:fs');
const [file, digest] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');
const pattern = /EXPECTED_MANIFEST_SHA256="[0-9a-f]{64}"/u;
if (!pattern.test(source)) process.exit(2);
fs.writeFileSync(file, source.replace(pattern, `EXPECTED_MANIFEST_SHA256="${digest}"`));
NODE

  set +e
  output="$(IROHA_SEND_AUDIT_ROOT="$fixture" bash "$audit_copy" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    fail "$label unexpectedly passed"
  fi
  [[ "$output" == *"$expected"* ]] || {
    printf '%s\n' "$output" >&2
    fail "$label did not report expected semantic marker: $expected"
  }
}

valid="$(new_fixture valid)"
run_audit "$valid" >/dev/null

fixture="$(new_fixture manifest-tamper)"
sed -i.bak 's/"browserTransactionEncoder": false/"browserTransactionEncoder": true/' \
  "$fixture/config/iroha-production-send-readiness.json"
rm -f "$fixture/config/iroha-production-send-readiness.json.bak"
expect_failure "manifest tamper" "$fixture" "manifest digest mismatch"

fixture="$(new_fixture reviewed-nexus-baseline-drift)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.reviewedUpstreamBundleContract.nexusBrowser.baselineBytes' \
  '215951'
expect_semantic_manifest_failure \
  "reviewed Nexus baseline drift" "$fixture" "unexpected reviewed upstream bundle contract facts"

fixture="$(new_fixture reviewed-nexus-legacy-cap)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.reviewedUpstreamBundleContract.nexusBrowser.capKiB' \
  '205'
expect_semantic_manifest_failure \
  "reviewed Nexus legacy 205 KiB cap" "$fixture" "unexpected reviewed upstream bundle contract facts"

fixture="$(new_fixture reviewed-aggregate-baseline-drift)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.reviewedUpstreamBundleContract.publicBrowserAggregate.baselineBytes' \
  '314581'
expect_semantic_manifest_failure \
  "reviewed aggregate baseline drift" "$fixture" "unexpected reviewed upstream bundle contract facts"

fixture="$(new_fixture reviewed-aggregate-legacy-cap)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.reviewedUpstreamBundleContract.publicBrowserAggregate.capKiB' \
  '300'
expect_semantic_manifest_failure \
  "reviewed aggregate legacy 300 KiB cap" "$fixture" "unexpected reviewed upstream bundle contract facts"

fixture="$(new_fixture dirty-nexus-observation-drift)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.dirtyTreeBundleObservation.nexusBrowser.observedBytes' \
  '215950'
expect_semantic_manifest_failure \
  "dirty Nexus observation promoted to baseline" "$fixture" "unexpected dirty-tree bundle observation facts"

fixture="$(new_fixture dirty-aggregate-observation-drift)"
mutate_manifest_field "$fixture" \
  'sourceEvidence.focusedTests.dirtyTreeBundleObservation.publicBrowserAggregate.observedBytes' \
  '314580'
expect_semantic_manifest_failure \
  "dirty aggregate observation promoted to baseline" "$fixture" "unexpected dirty-tree bundle observation facts"

fixture="$(new_fixture readiness-doc-reviewed-nexus-baseline-drift)"
sed -i.bak 's/reviewed baseline 215,950 bytes/reviewed baseline 215,951 bytes/' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure \
  "readiness doc reviewed Nexus baseline drift" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture readiness-doc-reviewed-aggregate-cap-drift)"
sed -i.bak 's/exact 328 KiB (335,872-byte) cap/exact 329 KiB (336,896-byte) cap/' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure \
  "readiness doc reviewed aggregate cap drift" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture checklist-dirty-observation-promoted)"
sed -i.bak \
  's/Dirty-tree observation (not reviewed-baseline or release-artifact evidence)/Dirty-tree reviewed baseline/' \
  "$fixture/docs/release-checklist.md"
rm -f "$fixture/docs/release-checklist.md.bak"
expect_failure \
  "release checklist dirty observation promoted" "$fixture" "release-checklist source-evidence marker"

fixture="$(new_fixture runtime-enabled)"
expect_failure "runtime enablement" "$fixture" "must remain false" VUE_APP_ENABLE_IROHA_TRANSFERS=true

fixture="$(new_fixture env-enabled)"
sed -i.bak 's/VUE_APP_ENABLE_IROHA_TRANSFERS=false/VUE_APP_ENABLE_IROHA_TRANSFERS=true/' "$fixture/.env.example"
rm -f "$fixture/.env.example.bak"
expect_failure "checked-in enablement" "$fixture" "enabled in .env.example"

fixture="$(new_fixture quoted-env-enabled)"
sed -i.bak 's/VUE_APP_ENABLE_IROHA_TRANSFERS=false/export VUE_APP_ENABLE_IROHA_TRANSFERS="true"/' "$fixture/.env.example"
rm -f "$fixture/.env.example.bak"
expect_failure "quoted checked-in enablement" "$fixture" "enabled in .env.example"

fixture="$(new_fixture package-unpinned)"
sed -i.bak \
  's#file:vendor/iroha-js/iroha-iroha-js-0.0.2.tgz#file:vendor/iroha-js/iroha-iroha-js-0.0.3.tgz#' \
  "$fixture/package.json"
rm -f "$fixture/package.json.bak"
expect_failure "package artifact changed" "$fixture" "not pinned to the reviewed vendored artifact"

fixture="$(new_fixture lock-checksum-changed)"
sed -i.bak 's/checksum: 10\/d9800e/checksum: 10\/000000/' "$fixture/yarn.lock"
rm -f "$fixture/yarn.lock.bak"
expect_failure "lock checksum changed" "$fixture" "Yarn content checksum"

fixture="$(new_fixture release-gate-removed)"
sed -i.bak "s/if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS !== 'true') return undefined;/if (false) return undefined;/" \
  "$fixture/src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts"
rm -f "$fixture/src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts.bak"
expect_failure "release gate removed" "$fixture" "release flag gate"

fixture="$(new_fixture build-gate-removed)"
sed -i.bak "s/if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true')/if (false)/" \
  "$fixture/vite.config.shared.mjs"
rm -f "$fixture/vite.config.shared.mjs.bak"
expect_failure "all-build-mode gate removed" "$fixture" "all-build-mode fail-closed gate"

fixture="$(new_fixture send-handler-loader-bypassed)"
sed -i.bak 's/requireProductionIrohaTransferCodec().then((codec) =>/Promise.resolve(testCodec).then((codec) =>/' \
  "$fixture/src/extension/background/extension-base/src/background/handlers/Extension.ts"
rm -f "$fixture/src/extension/background/extension-base/src/background/handlers/Extension.ts.bak"
expect_failure "send handler loader bypass" "$fixture" "production codec loader routing"

fixture="$(new_fixture pre-unlock-protocol-guard-removed)"
sed -i.bak 's/if (isIrohaTransferNetwork(network)) assertIrohaLiveSubmissionSupported();/if (false) assertIrohaLiveSubmissionSupported();/' \
  "$fixture/src/extension/background/extension-base/src/background/handlers/Extension.ts"
rm -f "$fixture/src/extension/background/extension-base/src/background/handlers/Extension.ts.bak"
expect_failure "pre-unlock protocol guard removed" "$fixture" "pre-unlock transfer-test protocol guard"

fixture="$(new_fixture live-compatibility-default-open)"
sed -i.bak "s/process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY !== REVIEWED_LIVE_COMPATIBILITY/process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY === 'legacy-offline-only'/" \
  "$fixture/src/extension/background/extension-base/src/api/iroha/transfer.ts"
rm -f "$fixture/src/extension/background/extension-base/src/api/iroha/transfer.ts.bak"
expect_failure "live compatibility default-open" "$fixture" "default-deny live compatibility guard"

fixture="$(new_fixture global-initialized)"
printf '\n(globalThis as any).__IROHA_NATIVE_BINDING__ = unsafeBinding;\n' >> \
  "$fixture/src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts"
expect_failure "global initialized" "$fixture" "removed native binding seam appeared in production source"

fixture="$(new_fixture global-spread)"
printf 'export const leaked = globalThis.__IROHA_NATIVE_BINDING__;\n' > "$fixture/src/leakedBinding.ts"
expect_failure "global seam spread" "$fixture" "removed native binding seam appeared in production source"

fixture="$(new_fixture source-codec-integrated)"
printf 'import { browserTransactionCodec } from "@iroha/iroha-js/transaction-codec";\nexport { browserTransactionCodec };\n' > \
  "$fixture/src/unpublishedCodecIntegration.ts"
expect_failure "unpublished source codec integrated" "$fixture" "source-only browser codec was integrated into production source"

fixture="$(new_fixture source-symlink)"
ln -s consts/universalWallet.ts "$fixture/src/linkedSource.ts"
expect_failure "source symlink" "$fixture" "production source tree contains a symlink"

fixture="$(new_fixture nexus-enabled)"
node - "$fixture/src/consts/universalWallet.ts" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const text = fs.readFileSync(path, 'utf8');
const start = text.indexOf('nexus: {');
const end = text.indexOf('\n  },', start);
fs.writeFileSync(path, text.slice(0, start) + text.slice(start, end).replace('enabledByDefault: false', 'enabledByDefault: true') + text.slice(end));
NODE
expect_failure "Nexus enabled" "$fixture" "Nexus registry default"

fixture="$(new_fixture tracked-wasm)"
mkdir -p "$fixture/vendor"
printf 'wasm\n' > "$fixture/vendor/iroha-norito.wasm"
git -C "$fixture" add .
expect_failure "unreviewed WASM tracked" "$fixture" "native/WASM codec artifact"

fixture="$(new_fixture checker-weakened)"
sed -i.bak "s/assertBrowserOnlyRelativeModuleGraph('dist\/nexusApp.js');/\/\/ removed/" \
  "$fixture/scripts/check-iroha-js-sdk-artifact.sh"
rm -f "$fixture/scripts/check-iroha-js-sdk-artifact.sh.bak"
expect_failure "SDK checker weakened" "$fixture" "SDK browser-blocker validation marker"

fixture="$(new_fixture fail-closed-test-removed)"
sed -i.bak 's/fails closed while Iroha transfers are not release-enabled/disabled transfer behavior/' \
  "$fixture/tests/unit/iroha-background-transfer.spec.ts"
rm -f "$fixture/tests/unit/iroha-background-transfer.spec.ts.bak"
expect_failure "fail-closed test removed" "$fixture" "disabled-release test"

fixture="$(new_fixture transfer-test-offline-guard-removed)"
sed -i.bak 's/keeps the transfer-test Iroha surface offline before key export, signing, or Torii access/allows live transfer-test submission/' \
  "$fixture/tests/unit/iroha-background-transfer.spec.ts"
rm -f "$fixture/tests/unit/iroha-background-transfer.spec.ts.bak"
expect_failure "transfer-test offline guard removed" "$fixture" "transfer-test no-secret/no-network test"

fixture="$(new_fixture mismatch-test-removed)"
sed -i.bak 's/rejects Nexus SDK signing when the stored mnemonic does not match the account public key/rejects mismatch/' \
  "$fixture/tests/unit/iroha-background-transfer.spec.ts"
rm -f "$fixture/tests/unit/iroha-background-transfer.spec.ts.bak"
expect_failure "key mismatch test removed" "$fixture" "key-mismatch adversarial test"

fixture="$(new_fixture stale-node-test-totals)"
sed -i.bak 's/2,317 total \/ 2,244 passed/2,316 total \/ 2,243 passed/' \
  "$fixture/docs/release-checklist.md"
rm -f "$fixture/docs/release-checklist.md.bak"
expect_failure "stale Node test totals" "$fixture" "release-checklist source-evidence marker"

fixture="$(new_fixture stale-final-tar-digest)"
sed -i.bak 's/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/25c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/g' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "stale final tar digest" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture stale-final-tar-counts)"
sed -i.bak 's/154 package files and 154 archive entries/151 package files and 151 archive entries/' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "stale final tar counts" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture false-safari-evidence)"
sed -i.bak 's/6 real Safari scenarios and 91 real Safari assertions/61 real Safari scenarios and 210 real Safari assertions/' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "false Safari evidence" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture source-vector-redacted)"
sed -i.bak 's/2332d0004eb24d97fd965fe68f6f31b0e51339764b4dd80f3ea50a3b6f7e5003/redacted/g' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "source vector redacted" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture live-gates-redacted)"
sed -i.bak 's/no fabricated fee is accepted/fabricated fee accepted/g' "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "live gates redacted" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture stale-absence-diagnosis)"
sed -i.bak 's/browser_transaction_codec_unpublished_source_only/browser_transaction_codec_absent/g' \
  "$fixture/docs/iroha-production-send-readiness.md"
rm -f "$fixture/docs/iroha-production-send-readiness.md.bak"
expect_failure "stale absence diagnosis restored" "$fixture" "pinned blocker evidence marker"

fixture="$(new_fixture capability-claim-regressed)"
sed -i.bak 's/is capability metadata, not a production-send/is production-send/' "$fixture/docs/universal-wallet-v2.md"
rm -f "$fixture/docs/universal-wallet-v2.md.bak"
expect_failure "capability claim regressed" "$fixture" "Universal Wallet non-enablement statement"

fixture="$(new_fixture manifest-symlink)"
rm "$fixture/config/iroha-production-send-readiness.json"
ln -s ../docs/iroha-production-send-readiness.md "$fixture/config/iroha-production-send-readiness.json"
expect_failure "manifest symlink" "$fixture" "missing or is a symlink"

fixture="$(new_fixture candidate-evidence-missing)"
rm "$fixture/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/iroha-iroha-js-0.0.3.tgz"
expect_failure "candidate evidence missing" "$fixture" "required regular file is missing"

fixture="$(new_fixture vendored-sdk-missing)"
rm "$fixture/vendor/iroha-js/iroha-iroha-js-0.0.2.tgz"
expect_failure "vendored SDK missing" "$fixture" "required regular file is missing"

fixture="$(new_fixture vendored-sdk-tamper)"
printf 'x' >> "$fixture/vendor/iroha-js/iroha-iroha-js-0.0.2.tgz"
expect_failure "vendored SDK tamper" "$fixture" "vendored Iroha SDK tarball byte count mismatch"

fixture="$(new_fixture vendored-sdk-audit-weakened)"
sed -i.bak 's/this audit accepts no path or digest overrides/audit arguments accepted/' \
  "$fixture/scripts/audit-vendored-iroha-js-sdk.mjs"
rm -f "$fixture/scripts/audit-vendored-iroha-js-sdk.mjs.bak"
expect_failure "vendored SDK audit weakened" "$fixture" "vendored Iroha SDK audit override guard"

fixture="$(new_fixture candidate-base-archive-missing)"
rm "$fixture/artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/b423c0f8-iroha-js-candidate-replay-base.tar.gz"
expect_failure "candidate base archive missing" "$fixture" "required regular file is missing"

fixture="$(new_fixture candidate-verifier-weakened)"
sed -i.bak 's/candidate tar digest mismatch/candidate archive mismatch/g' \
  "$fixture/scripts/verify-iroha-js-candidate.sh"
rm -f "$fixture/scripts/verify-iroha-js-candidate.sh.bak"
expect_failure "candidate verifier weakened" "$fixture" "durable candidate verifier marker"

fixture="$(new_fixture candidate-base-verifier-weakened)"
sed -i.bak 's/base source archive digest mismatch/base archive checksum mismatch/' \
  "$fixture/scripts/verify-iroha-js-base-source-archive.mjs"
rm -f "$fixture/scripts/verify-iroha-js-base-source-archive.mjs.bak"
expect_failure "candidate base verifier weakened" "$fixture" "base source archive verifier marker"

fixture="$(new_fixture safari-evidence-missing)"
rm "$fixture/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json"
expect_failure "Safari evidence missing" "$fixture" "required regular file is missing"

fixture="$(new_fixture safari-evidence-tamper)"
node - "$fixture/artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/safari-26.5.2.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.assertionTotal = 90;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_failure "Safari evidence tamper" "$fixture" "scenario/assertion totals mismatch"

fixture="$(new_fixture safari-runner-weakened)"
sed -i.bak 's/request.headers.host !== hostHeader/request.headers.host === hostHeader/' \
  "$fixture/scripts/run-iroha-js-candidate-safari-qa.mjs"
rm -f "$fixture/scripts/run-iroha-js-candidate-safari-qa.mjs.bak"
expect_failure "Safari runner weakened" "$fixture" "native Safari QA runner marker"

fixture_modes="$(awk '
  match($0, /new_fixture [[:alnum:]-]+/) {
    print substr($0, RSTART + 12, RLENGTH - 12)
  }
' "$0" | paste -sd, -)"
fixture_count="$(printf '%s\n' "$fixture_modes" | tr ',' '\n' | awk 'NF { count += 1 } END { print count + 0 }')"
[[ "$fixture_count" -eq 50 ]] || fail "internal fixture inventory changed: expected 50, found $fixture_count"
echo "[iroha-send-readiness-test][web] 50 fixtures passed (1 blocked baseline, 49 adversarial): $fixture_modes"
