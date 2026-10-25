#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCompleteFanout,
  assertCompleteRouting,
  readAssetDefinitions,
  toolsListRequest,
  runStaticAudit,
  TAIRA_ASSET_DEFINITIONS_PATH,
  validateAssetDefinitions,
  validateStatus,
  validateToolsList,
} from './audit-taira-release-readiness.mjs';

const CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const XOR_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
let cases = 0;

function expectFailure(label, callback, expected) {
  assert.throws(callback, expected, label);
  cases += 1;
}

const completeFanout = {
  'x-iroha-fanout-routes-attempted': '4',
  'x-iroha-fanout-routes-succeeded': '4',
  'x-iroha-fanout-routes-failed': '0',
  'x-iroha-fanout-routes-denied': '0',
  'x-iroha-fanout-routes-unavailable': '0',
  'x-iroha-fanout-routes-not-found': '0',
};
assertCompleteFanout(completeFanout);
cases += 1;
expectFailure(
  'partial 2xx fanout is rejected',
  () => assertCompleteFanout({
    ...completeFanout,
    'x-iroha-fanout-routes-succeeded': '1',
    'x-iroha-fanout-routes-failed': '3',
    'x-iroha-fanout-routes-unavailable': '3',
  }),
  /fanout is incomplete/u
);

const now = Date.now();
const status = {
  chain_id: CHAIN_ID,
  blocks: 3,
  peers: 4,
  time_since_last_block_ms: 1_000,
  last_block_committed_at_ms: now - 1_000,
  build: { git_commit_sha: COMMIT },
};
validateStatus(status, COMMIT, now);
cases += 1;
expectFailure(
  'status reports every independent release failure in one run',
  () => validateStatus({
    ...status,
    chain_id: '00000000-0000-0000-0000-000000000000',
    peers: -1,
    time_since_last_block_ms: 90_000,
    last_block_committed_at_ms: now - 90_000,
    build: { git_commit_sha: 'fedcba9876543210fedcba9876543210fedcba98' },
  }, COMMIT, now),
  (error) => {
    assert.match(error.message, /canonical UUID/u);
    assert.match(error.message, /nonnegative count/u);
    assert.match(error.message, /last 60 seconds/u);
    assert.match(error.message, /TAIRA_EXPECTED_BUILD_COMMIT/u);
    return true;
  }
);
expectFailure(
  'stale block progress is rejected',
  () => validateStatus({ ...status, time_since_last_block_ms: 90_000 }, COMMIT, now),
  /last 60 seconds/u
);
expectFailure(
  'negative block age is rejected',
  () => validateStatus({ ...status, time_since_last_block_ms: -1 }, COMMIT, now),
  /last 60 seconds/u
);
assert.doesNotThrow(
  () => validateStatus({ ...status, consensus: { manifest_path: '/srv/private/manifest.json' } }, COMMIT, now),
  'unrelated node metadata does not block wallet endpoint readiness'
);
cases += 1;

assert.equal(
  TAIRA_ASSET_DEFINITIONS_PATH,
  '/v1/assets/definitions?limit=500&include_total=true'
);
validateAssetDefinitions({ next_cursor: null, total: 1, items: [{ id: XOR_ID, spec: { scale: 9 } }] });
cases += 1;
expectFailure(
  'live unconstrained XOR is rejected',
  () =>
    validateAssetDefinitions({
      next_cursor: null,
      total: 1,
      items: [{ id: XOR_ID, spec: { scale: null } }],
    }),
  /spec\.scale 9/u
);
expectFailure(
  'unproven live asset-definition pagination is rejected',
  () => validateAssetDefinitions({ total: 1, items: [{ id: XOR_ID, spec: { scale: 9 } }] }),
  /complete canonical XOR snapshot/u
);
for (const cursor of [undefined, '', 'continuation', true]) {
  expectFailure(
    `incomplete asset-definition cursor ${String(cursor)} is rejected`,
    () => validateAssetDefinitions({ next_cursor: cursor, total: 1, items: [{ id: XOR_ID, spec: { scale: 9 } }] }),
    /complete canonical XOR snapshot/u
  );
}
validateStatus({ ...status, peers: 3, chain_id: undefined }, COMMIT, now);
cases += 1;
const routed = {
  'content-type': 'application/json',
  'x-iroha-route-lane-id': '0',
  'x-iroha-route-dataspace-id': '0',
  'x-iroha-routed-by': 'local',
};
assertCompleteRouting(routed);
assertCompleteRouting({ ...completeFanout, 'x-iroha-fanout-routes-attempted': '1', 'x-iroha-fanout-routes-succeeded': '1' });
cases += 2;
for (const headers of [
  {}, { ...routed, 'x-iroha-route-dataspace-id': '1' },
  { ...routed, 'x-iroha-routed-by': 'unknown' },
  { ...routed, 'x-iroha-fanout-routes-attempted': '1' },
  { ...completeFanout, 'x-iroha-fanout-routes-denied': '1' },
]) expectFailure('incomplete routing is never accepted', () => assertCompleteRouting(headers), /routing evidence|fanout|missing valid/u);

const request = toolsListRequest();
const payload = JSON.parse(request.body);
assert.equal(request.method, 'POST');
assert.equal(request.headers['MCP-Protocol-Version'], '2026-07-28');
assert.equal(request.headers['Mcp-Method'], payload.method);
assert.equal(payload.params._meta['io.modelcontextprotocol/protocolVersion'], request.headers['MCP-Protocol-Version']);
assert.deepEqual(payload.params._meta['io.modelcontextprotocol/clientCapabilities'], {});
assert.equal(request.headers['Mcp-Name'], undefined);
cases += 1;

const page = (body) => ({ headers: routed, body: Buffer.from(JSON.stringify(body)) });
const xor = { id: XOR_ID, spec: { scale: 9 } };
let paths = [];
await readAssetDefinitions(async (path) => {
  paths.push(path);
  return paths.length === 1
    ? page({ items: [{ id: 'another-definition' }], total: 2, next_cursor: 'next_page' })
    : page({ items: [xor], total: 2, next_cursor: null });
});
assert.deepEqual(paths, [TAIRA_ASSET_DEFINITIONS_PATH, `${TAIRA_ASSET_DEFINITIONS_PATH}&cursor=next_page`]);
cases += 1;
for (const pages of [
  [{ items: [xor], total: 1 }],
  [{ items: [xor], total: 1, next_cursor: 'repeat' }, { items: [], total: 1, next_cursor: 'repeat' }],
  [{ items: [], total: 1, next_cursor: 'next' }, { items: [xor], total: 2, next_cursor: null }],
  [{ items: [xor, xor], total: 2, next_cursor: null }],
  [{ items: [], total: 1, next_cursor: null }],
  [{ items: [], total: 1, next_cursor: '../../other' }],
]) {
  let index = 0;
  await assert.rejects(readAssetDefinitions(async () => page(pages[Math.min(index++, pages.length - 1)])),
    /inconsistent cursor page|repeated cursor|complete canonical XOR snapshot/u);
  cases += 1;
}
let unboundedPage = 0;
await assert.rejects(readAssetDefinitions(async () => page({ items: [], total: 1, next_cursor: `page_${unboundedPage++}` })), /page bound/u);
cases += 1;

validateToolsList({
  jsonrpc: '2.0',
  id: 1,
  result: {
    tools: [
      {
        name: 'iroha.transactions.submit_and_wait',
        inputSchema: {
          additionalProperties: false,
          properties: { body_base64: { type: 'string' }, hash: { type: 'string' } },
          required: ['body_base64'],
        },
      },
    ],
  },
});
cases += 1;
expectFailure(
  'retired signed transaction field is rejected',
  () => validateToolsList({
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [
        {
          name: 'iroha.transactions.submit_and_wait',
          inputSchema: {
            additionalProperties: false,
            properties: {
              body_base64: { type: 'string' },
              hash: { type: 'string' },
              signed_tx_base64: { type: 'string' },
            },
            required: ['signed_tx_base64'],
          },
        },
      ],
    },
  }),
  /required body_base64/u
);

expectFailure(
  'submit-and-wait without an explicit hash field is rejected',
  () => validateToolsList({
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [
        {
          name: 'iroha.transactions.submit_and_wait',
          inputSchema: {
            additionalProperties: false,
            properties: { body_base64: { type: 'string' } },
            required: ['body_base64'],
          },
        },
      ],
    },
  }),
  /required body_base64/u
);

const wrapper = readFileSync(resolve(SCRIPT_DIR, 'audit-taira-release-readiness.sh'), 'utf8');
for (const variable of [
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_USE_ENV_PROXY',
  'NODE_OPTIONS',
  'SSLKEYLOGFILE',
  'SSL_CERT_FILE',
  'HTTPS_PROXY',
  'GLOBAL_AGENT_HTTPS_PROXY',
]) {
  assert.match(wrapper, new RegExp(`-u ${variable}(?: \\\\)?$`, 'mu'), `wrapper must clear ${variable}`);
}
cases += 1;

function writeFixture(root, relative, contents) {
  const path = resolve(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

const historicalSubstitutionRoot = mkdtempSync(resolve(tmpdir(), 'fearless-taira-mobile-source-'));
try {
  // These files only let the reader reach the missing canonical candidate.
  for (const relative of [
    'src/consts/universalWallet.ts',
    'src/extension/background/extension-base/src/services/iroha-torii-service/index.ts',
    'src/extension/background/extension-base/src/services/balance-service/IrohaBalanceService.ts',
    'src/history/fetchingHistory.ts', 'src/util/iroha.ts', 'src/util/BaseApi.ts',
    'src/extension/background/extension-base/src/api/iroha/transfer.ts',
    'src/extension/background/extension-base/src/background/handlers/State.ts',
  ]) writeFixture(historicalSubstitutionRoot, `fearless-wallet-web/${relative}`, '// fixture\n');
  for (const relative of [
    'common/src/main/java/jp/co/soramitsu/common/model/UniversalWalletRegistry.kt',
    'common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiClient.kt',
    'common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiModels.kt',
    'common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiRoutes.kt',
    'common/src/main/java/jp/co/soramitsu/common/di/modules/NetworkModule.kt',
    'feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/historySource/IrohaHistorySource.kt',
    'feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/IrohaBalanceLoader.kt',
    'runtime/src/main/java/jp/co/soramitsu/runtime/ext/UniversalWalletIrohaExt.kt',
    'feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/BalanceLoaderProvider.kt',
    'feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/repository/tranfser/TransferService.kt',
    'feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/MetaAccount.kt',
    'feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/AndroidUniversalWalletMigrationSnapshotBuilder.kt',
  ]) writeFixture(historicalSubstitutionRoot, `fearless-Android-retired-fixture/${relative}`, '// fixture\n');
  expectFailure(
    'historical Android checkout cannot replace a missing canonical candidate',
    () => runStaticAudit({ root: historicalSubstitutionRoot }),
    /Android universal-wallet registry is missing or unreadable at .*fearless-Android\//u
  );
  renameSync(resolve(historicalSubstitutionRoot, 'fearless-Android-retired-fixture'),
    resolve(historicalSubstitutionRoot, 'fearless-Android'));
  writeFixture(historicalSubstitutionRoot,
    'fearless-iOS-retired-fixture/fearless/Common/Model/UniversalWalletRegistry.swift', '// fixture\n');
  expectFailure(
    'historical iOS checkout cannot replace a missing canonical candidate',
    () => runStaticAudit({ root: historicalSubstitutionRoot }),
    /iOS universal-wallet registry is missing or unreadable at .*fearless-iOS\//u
  );
  const auditSource = readFileSync(resolve(SCRIPT_DIR, 'audit-taira-release-readiness.mjs'), 'utf8');
  const walletFiles = [...auditSource.matchAll(/resolve\(root, '([^']+)'\)/gu)].map((match) => match[1]);
  assert.ok(walletFiles.length >= 20);
  assert.ok(walletFiles.every((path) => /^(fearless-wallet-web|fearless-Android|fearless-iOS)\//u.test(path)));
  for (const file of walletFiles) writeFixture(historicalSubstitutionRoot, file, '// incomplete wallet fixture\n');
  expectFailure(
    'wallet audit reaches genuine contract failures with no sibling Iroha checkout or Cargo',
    () => runStaticAudit({ root: historicalSubstitutionRoot }),
    (error) => {
      assert.match(error.message, /wallet Taira source checks failed/u);
      assert.match(error.message, /canonical|chain contract/u);
      assert.doesNotMatch(error.message, /genesis|Cargo|HF hosting|mailbox/u);
      return true;
    }
  );
} finally {
  rmSync(historicalSubstitutionRoot, { force: true, recursive: true });
}

// Deliberately authored synthetic source snippets for this source-prerequisite
// audit. They are neither executable wallet implementations nor application-test
// evidence, and must remain independent of the validator's required literals.
const walletSourceFixture = {
  webRegistry: ['fearless-wallet-web/src/consts/universalWallet.ts', String.raw`
export const networks = {
  taira: {
    chainId: 'fc56984b-2be7-431d-840e-21514d1883f0',
    toriiBaseUrl: 'https://taira.sora.org',
    nativeAsset: { id: '6TEAJqbb8oEPmLncoNiMRbLEK6tw', symbol: 'XOR', decimals: 9 },
  },
  nexus: {}
};`],
  webClient: ['fearless-wallet-web/src/extension/background/extension-base/src/services/iroha-torii-service/index.ts', String.raw`
const protocol = '2026-07-28';
const metadata = { 'io.modelcontextprotocol/protocolVersion': protocol, 'io.modelcontextprotocol/clientCapabilities': {} };
const headers = { 'MCP-Protocol-Version': protocol, 'Mcp-Method': method, 'Mcp-Name': name };
const page = { next_cursor: cursor };
const tool = 'iroha.transactions.submit_and_wait';
const body = { body_base64: signedBytes };
const receiptHash = receipt.signed_transaction_hash;
if (final.resolved_from !== 'state' || final.scope !== 'global' || final.kind !== 'Applied') reject();
const routingHeaders = ['x-iroha-route-lane-id', 'x-iroha-route-dataspace-id', 'x-iroha-fanout-routes-failed'];
const contentType = 'application/json';
const fetchOptions = { redirect: 'error' };
if (url.search || url.hash) reject();
if (rpcResponse.jsonrpc !== '2.0' || rpcResponse.id !== requestId) reject();
if (Object.hasOwn(rpcResponse, 'result') === Object.hasOwn(rpcResponse, 'error')) reject();`],
  webBalance: ['fearless-wallet-web/src/extension/background/extension-base/src/services/balance-service/IrohaBalanceService.ts', String.raw`
const cursor = page.next_cursor;
const scale = definition.spec.scale;
if (item.account_id !== requestedAccountId) reject();
if (!isCanonicalIrohaAssetDefinitionId(this.getAssetId(item), network)) reject();
if (seenScopes.has(scopeKey)) reject();
const MAX_IROHA_NUMERIC = (1n << 511n) - 1n;
const total = sumCanonicalIrohaQuantities(items);`],
  webHistory: ['fearless-wallet-web/src/history/fetchingHistory.ts', String.raw`
const cursor = response.next_cursor;
if (transactionStatus !== 'Committed') reject();
const amount = scaledIrohaIntegerToBaseUnits(value);
const entry = { fee: null };`],
  webTransfer: ['fearless-wallet-web/src/extension/background/extension-base/src/api/iroha/transfer.ts', String.raw`
if (!canonicalIdentity) throw new Error('noncanonical_iroha_chain_id');
const hashPattern = '^[0-9a-f]{63}[13579bdf]$';`],
  webAddress: ['fearless-wallet-web/src/util/iroha.ts', "throw new Error('unsupported_iroha_chain_id');"],
  webBaseApi: ['fearless-wallet-web/src/util/BaseApi.ts', 'resolveCanonicalIrohaAddressNetwork(chainId);'],
  webState: ['fearless-wallet-web/src/extension/background/extension-base/src/background/handlers/State.ts', 'resolveCanonicalIrohaAddressNetwork(chainId);'],
  androidRegistry: ['fearless-Android/common/src/main/java/jp/co/soramitsu/common/model/UniversalWalletRegistry.kt', String.raw`
const val TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0"
const val TAIRA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw"
    val taira = IrohaNetwork(
        chainId = TAIRA_CHAIN_ID,
        toriiBaseUrl = "https://taira.sora.org",
        nativeAsset = NativeAsset(id = TAIRA_XOR_ASSET_DEFINITION_ID, symbol = "XOR", decimals = 9)
    )
    val nexus = IrohaNetwork()`],
  androidClient: ['fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiClient.kt', String.raw`
val protocol = "2026-07-28"
val metadata = mapOf("io.modelcontextprotocol/protocolVersion" to protocol, "io.modelcontextprotocol/clientCapabilities" to emptyMap())
val headers = mapOf("MCP-Protocol-Version" to protocol, "Mcp-Method" to method, "Mcp-Name" to name)
val tool = "iroha.transactions.submit_and_wait"
val body = mapOf("body_base64" to signedBytes)
if (final.resolvedFrom != "state" || final.scope != "global" || final.kind != "Applied") reject()
val routingHeaders = listOf("x-iroha-route-lane-id", "x-iroha-route-dataspace-id", "x-iroha-fanout-routes-failed")
val contentType = "application/json"
if (response.jsonrpc != "2.0" || response.id != request.id || !hasExactlyOnePayload) reject()`],
  androidModels: ['fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiModels.kt', String.raw`
@SerializedName("next_cursor") val nextCursor: String?
@SerializedName("signed_transaction_hash") val signedTransactionHash: String
@SerializedName("resolved_from") val resolvedFrom: String`],
  androidRoutes: ['fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiRoutes.kt', String.raw`
val page = "cursor=" + cursor
if (parsed.userInfo != null || parsed.query != null || parsed.ref != null) reject()
val isLocal = parsed.host == "localhost" || parsed.host == "127.0.0.1"
if (parsed.protocol != "https" && !(parsed.protocol == "http" && isLocal)) reject()`],
  androidNetwork: ['fearless-Android/common/src/main/java/jp/co/soramitsu/common/di/modules/NetworkModule.kt', String.raw`
fun irohaNoRedirectHttpClient(client: OkHttpClient) = client.newBuilder().followRedirects(false).followSslRedirects(false).build()
val api = creator(irohaNoRedirectHttpClient(okHttpClient))`],
  androidHistory: ['fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/historySource/IrohaHistorySource.kt', String.raw`
val cursor = response["next_cursor"]
if (transactionStatus != "Committed") reject()
val outgoing = sourceAccount == accountAddress
val fee = null`],
  androidBalance: ['fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/IrohaBalanceLoader.kt', String.raw`
val cursor = response.nextCursor
val scale = definition.spec.scale
if (item.accountId != address) reject()
val canonicalItemAsset = IrohaToriiRoutes.normalizeAssetDefinitionId(presentItemAsset)
if (!seenAccountAssetScopes.add(canonicalItemAsset to canonicalScope)) reject()
if (value > maxBalanceInPlanks.subtract(total)) reject()`],
  androidIdentity: ['fearless-Android/runtime/src/main/java/jp/co/soramitsu/runtime/ext/UniversalWalletIrohaExt.kt', String.raw`
fun Chain.hasNonCanonicalUniversalWalletIrohaIdentity() = id != canonicalChainId`],
  androidBalanceProvider: ['fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/BalanceLoaderProvider.kt', 'if (chain.hasNonCanonicalUniversalWalletIrohaIdentity()) reject()'],
  androidTransfer: ['fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/repository/tranfser/TransferService.kt', String.raw`
if (chain.hasNonCanonicalUniversalWalletIrohaIdentity()) reject()
val canonicalHash = Regex("^[0-9a-f]{63}[13579bdf]$")`],
  androidMetaAccount: ['fearless-Android/feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/MetaAccount.kt', 'val chainId = UniversalWalletRegistry.taira.chainId'],
  androidMigration: ['fearless-Android/feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/AndroidUniversalWalletMigrationSnapshotBuilder.kt', 'val chainId = UniversalWalletRegistry.taira.chainId'],
  iosRegistry: ['fearless-iOS/fearless/Common/Model/UniversalWalletRegistry.swift', String.raw`
    static let taira = IrohaNetwork(
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        toriiBaseURL: URL(string: "https://taira.sora.org")!
    )
    static let tairaNativeXorAssetDefinitionId = "6TEAJqbb8oEPmLncoNiMRbLEK6tw"
    static let tairaNativeXorPrecision: UInt16 = 9
    static let nativeAsset = Asset(precision: tairaNativeXorPrecision)
    static let tairaChainIconURL = iconURL`],
  iosClient: ['fearless-iOS/fearless/Common/Model/IrohaToriiClient.swift', String.raw`
let protocolVersion = "2026-07-28"
let metadata = ["io.modelcontextprotocol/protocolVersion": protocolVersion, "io.modelcontextprotocol/clientCapabilities": [:]]
let headers = ["MCP-Protocol-Version": protocolVersion, "Mcp-Method": method, "Mcp-Name": name]
let tool = "iroha.transactions.submit_and_wait"
let body = ["body_base64": signedBytes]
guard final.resolvedFrom == "state", final.scope == "global", final.kind == "Applied" else { reject() }
let routingHeaders = ["x-iroha-route-lane-id", "x-iroha-route-dataspace-id", "x-iroha-fanout-routes-failed"]
let contentType = "application/json"
let transport = IrohaNoRedirectHTTPTransport()
completionHandler(nil)
guard response.jsonrpc == "2.0", response.id == .string(request.id), hasExactlyOnePayload else { reject() }`],
  iosContract: ['fearless-iOS/fearless/Common/Model/IrohaToriiContract.swift', String.raw`
case nextCursor = "next_cursor"
case signedTransactionHash = "signed_transaction_hash"
case resolvedFrom = "resolved_from"
let query = "cursor=" + cursor
guard url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { reject() }
let isLocal = host == "localhost" || host == "127.0.0.1"
guard scheme == "https" || (scheme == "http" && isLocal) else { reject() }`],
  iosTransfer: ['fearless-iOS/fearless/ApplicationLayer/Services/Transfer/Tokens/TransferService.swift', String.raw`let canonicalHash = "^[0-9a-f]{63}[13579bdf]$"`],
  iosHistory: ['fearless-iOS/fearless/CoreLayer/OperationFactory/BlockExplorer/History/Main/IrohaHistoryOperationFactory.swift', String.raw`
let cursor = response["next_cursor"]
guard transactionStatus == "Committed" else { reject() }
let outgoing = sourceAccount == accountAddress
let entry = Entry(fees: [])`],
  iosBalance: ['fearless-iOS/fearless/ApplicationLayer/Services/Balance/RemoteSubscription/AccountInfoRemoteService.swift', String.raw`
let cursor = response.nextCursor
let scale = definition.spec.scale
guard item.accountID == address else { reject() }
let canonicalAsset = IrohaToriiRoutes.normalizeAssetDefinitionId(item.asset)
guard seenAssetScopes.insert("\(canonicalAsset)\u{0}\(canonicalScope)").inserted else { reject() }
guard value <= maxBalanceInPlanks - total else { reject() }`],
  iosAddressResolver: ['fearless-iOS/fearless/Common/Model/UniversalWalletAccountAddressResolver.swift', 'let network = exactIrohaNetwork(for: requestedChainId)'],
  iosMapper: ['fearless-iOS/fearless/Common/Storage/EntityToModel/MetaAccountMapper.swift', 'if isNonCanonicalIrohaIdentity(chainId) { quarantine() }'],
  iosMigration: ['fearless-iOS/fearless/Common/Model/UniversalWalletMigrationContract.swift', 'let account = chainAccount(matchingExactly: Self.tairaChainIds)'],
  iosSend: ['fearless-iOS/fearless/Modules/Send/SendDependencyContainer.swift', 'if isNonCanonicalIrohaProfile { reject() }'],
};

const walletMutations = [
  ['web registry', 'webRegistry', 'decimals: 9', 'decimals: 18'],
  ['Android registry', 'androidRegistry', 'decimals = 9', 'decimals = 18'],
  ['iOS registry', 'iosRegistry', 'tairaNativeXorPrecision: UInt16 = 9', 'tairaNativeXorPrecision: UInt16 = 18'],
  ['web stateless MCP', 'webClient', '2026-07-28', '2025-03-26'],
  ['Android stateless MCP', 'androidClient', '2026-07-28', '2025-03-26'],
  ['iOS stateless MCP', 'iosClient', '2026-07-28', '2025-03-26'],
  ['web cursor balances', 'webClient', 'next_cursor', 'retired_next'],
  ['Android cursor balances', 'androidModels', 'next_cursor', 'retired_next'],
  ['Android cursor balances', 'androidRoutes', 'val page = "cursor=" + cursor', 'val page = "cursor=" + cursor\nval retiredPage = "offset=$it"'],
  ['Android cursor balances', 'androidRoutes', 'val page = "cursor=" + cursor', 'val page = "cursor=" + cursor\nval retiredPage = "count_mode=${it.apiValue}"'],
  ['iOS cursor balances', 'iosContract', 'next_cursor', 'retired_next'],
  ['web cursor history', 'webHistory', 'next_cursor', 'retired_next'],
  ['Android cursor history', 'androidHistory', 'next_cursor', 'retired_next'],
  ['iOS cursor history', 'iosHistory', 'next_cursor', 'retired_next'],
  ['web terminal transaction binding', 'webClient', 'iroha.transactions.submit_and_wait', 'iroha.transactions.submit'],
  ['Android terminal transaction binding', 'androidClient', 'iroha.transactions.submit_and_wait', 'iroha.transactions.submit'],
  ['iOS terminal transaction binding', 'iosClient', 'iroha.transactions.submit_and_wait', 'iroha.transactions.submit'],
  ['web routed response evidence', 'webClient', 'x-iroha-route-lane-id', 'removed-lane-evidence'],
  ['Android routed response evidence', 'androidClient', 'x-iroha-route-lane-id', 'removed-lane-evidence'],
  ['iOS routed response evidence', 'iosClient', 'x-iroha-route-lane-id', 'removed-lane-evidence'],
  ['web transport and identity', 'webClient', "redirect: 'error'", "redirect: 'follow'"],
  ['Android transport', 'androidNetwork', '.followSslRedirects(false)', '.followSslRedirects(true)'],
  ['Android transport', 'androidClient', 'response.jsonrpc != "2.0"', 'response.jsonrpc != "1.0"'],
  ['Android transport', 'androidClient', 'response.id != request.id', 'response.id != unrelatedId'],
  ['Android transport', 'androidRoutes', 'parsed.protocol != "https"', 'parsed.protocol != "http"'],
  ['Android transport', 'androidRoutes', 'parsed.host == "localhost" || parsed.host == "127.0.0.1"', 'parsed.host.endsWith("localhost")'],
  ['Android account identity', 'androidMetaAccount', 'UniversalWalletRegistry.taira.chainId', 'UniversalWalletRegistry.taira.id'],
  ['iOS transport', 'iosClient', 'completionHandler(nil)', 'completionHandler(newRequest)'],
  ['iOS transport', 'iosClient', 'response.jsonrpc == "2.0"', 'response.jsonrpc == "1.0"'],
  ['iOS transport', 'iosContract', 'scheme == "https"', 'scheme == "http"'],
  ['iOS transport', 'iosContract', 'host == "localhost" || host == "127.0.0.1"', 'host.hasSuffix("localhost")'],
  ['iOS account identity', 'iosMapper', 'isNonCanonicalIrohaIdentity(chainId)', 'isAllowedIdentity(chainId)'],
  ['web balance identity and arithmetic', 'webBalance', 'seenScopes.has(scopeKey)', 'seenScopes.has(otherKey)'],
  ['Android balance identity and arithmetic', 'androidBalance', 'value > maxBalanceInPlanks.subtract(total)', 'value > maxBalanceInPlanks'],
  ['iOS balance identity and arithmetic', 'iosBalance', 'value <= maxBalanceInPlanks - total', 'value <= maxBalanceInPlanks'],
  ['web history integrity', 'webHistory', 'fee: null', 'fee: 0'],
  ['Android history integrity', 'androidHistory', 'sourceAccount == accountAddress', 'sourceAccount.contains(accountAddress)'],
  ['iOS history integrity', 'iosHistory', 'fees: []', 'fees: [0]'],
];
assert.equal(new Set(walletMutations.map(([group]) => group)).size, 29, 'every grouped source prerequisite needs a mutation');

const validWalletRoot = mkdtempSync(resolve(tmpdir(), 'fearless-taira-valid-wallet-'));
try {
  for (const [relative, source] of Object.values(walletSourceFixture)) writeFixture(validWalletRoot, relative, source);
  runStaticAudit({ root: validWalletRoot });
  cases += 1;
  for (const [group, key, before, after] of walletMutations) {
    const [relative, source] = walletSourceFixture[key];
    assert.equal(source.split(before).length, 2, `${group} mutation must change exactly one source prerequisite`);
    writeFixture(validWalletRoot, relative, source.replace(before, after));
    try {
      expectFailure(`${group} mutation is rejected by the real static audit`, () => runStaticAudit({ root: validWalletRoot }), (error) => {
        const failedGroups = [...error.message.matchAll(/^  - ([^:]+):/gmu)].map((match) => match[1]);
        assert.deepEqual(failedGroups, [group], 'an independent mutation must fail its intended gate only');
        return true;
      });
    } finally {
      writeFixture(validWalletRoot, relative, source);
    }
  }
  runStaticAudit({ root: validWalletRoot });
  cases += 1;
} finally {
  rmSync(validWalletRoot, { force: true, recursive: true });
}

process.stdout.write(`[taira-readiness-test] ${cases} cases passed\n`);
