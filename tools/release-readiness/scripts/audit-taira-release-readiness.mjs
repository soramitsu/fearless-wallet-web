#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const TAIRA_XOR_SCALE = 9;
const TAIRA_ORIGIN = 'https://taira.sora.org';
const TAIRA_ASSET_DEFINITIONS_PATH = '/v1/assets/definitions?limit=500&include_total=true';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_BLOCK_AGE_MS = 60_000;

class AuditError extends Error {}

function fail(message) {
  throw new AuditError(message);
}

function boundedDiagnostic(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string' && error.trim()
        ? error
        : 'unexpected check failure';
  return message.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, 512);
}

function requireText(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    fail(`${label} is missing or unreadable at ${path}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

function requireLiteral(text, literal, label) {
  if (!text.includes(literal)) fail(`${label} is missing ${JSON.stringify(literal)}`);
}

function requireExactlyOnce(text, literal, label) {
  const first = text.indexOf(literal);
  if (first < 0) fail(`${label} is missing ${JSON.stringify(literal)}`);
  if (text.indexOf(literal, first + literal.length) >= 0) {
    fail(`${label} must contain ${JSON.stringify(literal)} exactly once`);
  }
  return first;
}

function requireScopedLiterals(text, start, end, literals, label) {
  const startIndex = requireExactlyOnce(text, start, `${label} start`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex < 0) fail(`${label} is missing its closing scope ${JSON.stringify(end)}`);
  const scope = text.slice(startIndex, endIndex);
  for (const literal of literals) requireLiteral(scope, literal, label);
  return scope;
}

function validateWalletRegistry(text, label, { scopeEnd, scopeLiterals, scopeStart }) {
  requireLiteral(text, TAIRA_CHAIN_ID, `${label} Taira chain contract`);
  requireLiteral(text, TAIRA_XOR_ASSET_ID, `${label} Taira native asset contract`);
  requireScopedLiterals(text, scopeStart, scopeEnd, scopeLiterals, `${label} Taira registry entry`);
  if (text.includes('iroha3-taira')) fail(`${label} still contains the retired Taira chain alias`);
}

function runStaticAudit({ root }) {
  const webRegistry = requireText(
    resolve(root, 'fearless-wallet-web/src/consts/universalWallet.ts'),
    'web universal-wallet registry'
  );
  const webTorii = requireText(
    resolve(root, 'fearless-wallet-web/src/extension/background/extension-base/src/services/iroha-torii-service/index.ts'),
    'web Torii client'
  );
  const webBalance = requireText(
    resolve(root, 'fearless-wallet-web/src/extension/background/extension-base/src/services/balance-service/IrohaBalanceService.ts'),
    'web Iroha balance service'
  );
  const webHistory = requireText(
    resolve(root, 'fearless-wallet-web/src/history/fetchingHistory.ts'),
    'web Iroha history service'
  );
  const webTransfer = requireText(
    resolve(root, 'fearless-wallet-web/src/extension/background/extension-base/src/api/iroha/transfer.ts'),
    'web Iroha transfer service'
  );
  const webIrohaAddress = requireText(
    resolve(root, 'fearless-wallet-web/src/util/iroha.ts'),
    'web Iroha address codec'
  );
  const webBaseApi = requireText(
    resolve(root, 'fearless-wallet-web/src/util/BaseApi.ts'),
    'web foreground address routing'
  );
  const webState = requireText(
    resolve(root, 'fearless-wallet-web/src/extension/background/extension-base/src/background/handlers/State.ts'),
    'web background address routing'
  );
  const androidRegistry = requireText(
    resolve(root, 'fearless-Android/common/src/main/java/jp/co/soramitsu/common/model/UniversalWalletRegistry.kt'),
    'Android universal-wallet registry'
  );
  const androidTorii = requireText(
    resolve(root, 'fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiClient.kt'),
    'Android Torii client'
  );
  const androidToriiModels = requireText(
    resolve(root, 'fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiModels.kt'),
    'Android Torii models'
  );
  const androidToriiRoutes = requireText(
    resolve(root, 'fearless-Android/common/src/main/java/jp/co/soramitsu/common/data/network/iroha/IrohaToriiRoutes.kt'),
    'Android Torii routes'
  );
  const androidNetworkModule = requireText(
    resolve(root, 'fearless-Android/common/src/main/java/jp/co/soramitsu/common/di/modules/NetworkModule.kt'),
    'Android network module'
  );
  const androidHistory = requireText(
    resolve(root, 'fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/historySource/IrohaHistorySource.kt'),
    'Android Iroha history service'
  );
  const androidBalance = requireText(
    resolve(root, 'fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/IrohaBalanceLoader.kt'),
    'Android Iroha balance service'
  );
  const androidIdentity = requireText(
    resolve(root, 'fearless-Android/runtime/src/main/java/jp/co/soramitsu/runtime/ext/UniversalWalletIrohaExt.kt'),
    'Android Iroha identity routing'
  );
  const androidBalanceProvider = requireText(
    resolve(root, 'fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/network/blockchain/balance/BalanceLoaderProvider.kt'),
    'Android balance routing'
  );
  const androidTransfer = requireText(
    resolve(root, 'fearless-Android/feature-wallet-impl/src/main/java/jp/co/soramitsu/wallet/impl/data/repository/tranfser/TransferService.kt'),
    'Android transfer routing'
  );
  const androidMetaAccount = requireText(
    resolve(root, 'fearless-Android/feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/MetaAccount.kt'),
    'Android stored account routing'
  );
  const androidMigration = requireText(
    resolve(root, 'fearless-Android/feature-account-api/src/main/java/jp/co/soramitsu/account/api/domain/model/AndroidUniversalWalletMigrationSnapshotBuilder.kt'),
    'Android migration routing'
  );
  const iosRegistry = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Model/UniversalWalletRegistry.swift'),
    'iOS universal-wallet registry'
  );
  const iosTorii = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Model/IrohaToriiClient.swift'),
    'iOS Torii client'
  );
  const iosToriiContract = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Model/IrohaToriiContract.swift'),
    'iOS Torii contract'
  );
  const iosTransfer = requireText(
    resolve(root, 'fearless-iOS/fearless/ApplicationLayer/Services/Transfer/Tokens/TransferService.swift'),
    'iOS transfer service'
  );
  const iosHistory = requireText(
    resolve(root, 'fearless-iOS/fearless/CoreLayer/OperationFactory/BlockExplorer/History/Main/IrohaHistoryOperationFactory.swift'),
    'iOS Iroha history service'
  );
  const iosBalance = requireText(
    resolve(root, 'fearless-iOS/fearless/ApplicationLayer/Services/Balance/RemoteSubscription/AccountInfoRemoteService.swift'),
    'iOS Iroha balance service'
  );
  const iosAddressResolver = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Model/UniversalWalletAccountAddressResolver.swift'),
    'iOS stored account routing'
  );
  const iosMetaAccountMapper = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Storage/EntityToModel/MetaAccountMapper.swift'),
    'iOS stored account quarantine'
  );



  const iosMigration = requireText(
    resolve(root, 'fearless-iOS/fearless/Common/Model/UniversalWalletMigrationContract.swift'),
    'iOS migration routing'
  );
  const iosSendContainer = requireText(
    resolve(root, 'fearless-iOS/fearless/Modules/Send/SendDependencyContainer.swift'),
    'iOS send routing'
  );
  const failures = [];
  const check = (label, callback) => {
    try { callback(); } catch (error) { failures.push(`${label}: ${boundedDiagnostic(error)}`); }
  };
  check('web registry', () => validateWalletRegistry(webRegistry, 'web', {
    scopeStart: '  taira: {', scopeEnd: '  nexus: {',
    scopeLiterals: [
      `chainId: '${TAIRA_CHAIN_ID}'`, `toriiBaseUrl: '${TAIRA_ORIGIN}'`,
      `id: '${TAIRA_XOR_ASSET_ID}'`, "symbol: 'XOR'", 'decimals: 9',
    ],
  }));
  check('Android registry', () => validateWalletRegistry(androidRegistry, 'Android', {
    scopeStart: '    val taira = IrohaNetwork(', scopeEnd: '    val nexus = IrohaNetwork(',
    scopeLiterals: ['chainId = TAIRA_CHAIN_ID', `toriiBaseUrl = "${TAIRA_ORIGIN}"`,
      'id = TAIRA_XOR_ASSET_DEFINITION_ID', 'symbol = "XOR"', 'decimals = 9'],
  }));
  check('iOS registry', () => {
    validateWalletRegistry(iosRegistry, 'iOS', {
      scopeStart: '    static let taira = IrohaNetwork(', scopeEnd: '    static let tairaChainIconURL',
      scopeLiterals: [`chainId: "${TAIRA_CHAIN_ID}"`, `toriiBaseURL: URL(string: "${TAIRA_ORIGIN}")!`,
        `tairaNativeXorAssetDefinitionId = "${TAIRA_XOR_ASSET_ID}"`, 'tairaNativeXorPrecision: UInt16 = 9'],
    });
    requireLiteral(iosRegistry, 'precision: tairaNativeXorPrecision', 'iOS native asset scale binding');
  });

  // These are wallet source prerequisites, not proofs of node deployment or of
  // passing application tests. Keep missing current-protocol support blocking.
  for (const [label, client, models, routes, balance, history, transfer] of [
    ['web', webTorii, webTorii, webTorii, webBalance, webHistory, webTransfer],
    ['Android', androidTorii, androidToriiModels, androidToriiRoutes, androidBalance, androidHistory, androidTransfer],
    ['iOS', iosTorii, iosToriiContract, iosToriiContract, iosBalance, iosHistory, iosTransfer],
  ]) {
    check(`${label} stateless MCP`, () => {
      const source = client + models + routes;
      for (const value of ['2026-07-28', 'io.modelcontextprotocol/protocolVersion',
        'io.modelcontextprotocol/clientCapabilities', 'MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name']) {
        requireLiteral(source, value, 'current MCP request contract');
      }
    });
    check(`${label} cursor balances`, () => {
      requireLiteral(models, 'next_cursor', 'current Torii list response');
      requireLiteral(routes, 'cursor', 'current Torii list request');
      requireLiteral(balance, 'cursor', 'complete balance cursor traversal');
      requireLiteral(balance, 'scale', 'balance NumericSpec validation');
      if (/['"](?:offset|count_mode)(?:['"]|=)/u.test(routes)) {
        fail('Torii list requests still encode retired offset/count_mode fields');
      }
    });
    check(`${label} cursor history`, () => {
      requireLiteral(history, 'next_cursor', 'snapshot-bound history cursor response');
      requireLiteral(history, 'cursor', 'snapshot-bound history cursor request');
      if (/['"](?:per_page|total_pages)['"]/u.test(history)) {
        fail('history still consumes the retired numbered-page envelope');
      }
    });
    check(`${label} terminal transaction binding`, () => {
      requireLiteral(client, 'iroha.transactions.submit_and_wait', 'terminal transaction workflow');
      requireLiteral(client, 'body_base64', 'signed transaction envelope');
      requireLiteral(client + models, 'signed_transaction_hash', 'signed receipt hash binding');
      requireLiteral(client + models, 'resolved_from', 'state-resolved finality');
      requireLiteral(client, 'state', 'state-resolved finality');
      requireLiteral(client, 'global', 'global finality scope');
      requireLiteral(client + models, 'Applied', 'terminal Applied status');
      requireLiteral(transfer, '^[0-9a-f]{63}[13579bdf]$', 'exact locally-derived transaction hash');
      if (/['"](?:terminal_statuses|final_status)['"]/u.test(client + models)) {
        fail('submit-and-wait still uses retired terminal_statuses/final_status fields');
      }
    });
    check(`${label} routed response evidence`, () => {
      for (const value of ['x-iroha-route-lane-id', 'x-iroha-route-dataspace-id',
        'x-iroha-fanout-routes-failed', 'application/json']) {
        requireLiteral(client + history, value, 'current routing and content-type validation');
      }
    });
  }

  check('web transport and identity', () => {
    for (const marker of ["redirect: 'error'", 'url.search ||', 'url.hash',
      "rpcResponse.jsonrpc !== '2.0' || rpcResponse.id !== requestId",
      "Object.hasOwn(rpcResponse, 'result') === Object.hasOwn(rpcResponse, 'error')"]) {
      requireLiteral(webTorii, marker, 'strict web response boundary');
    }
    requireLiteral(webTransfer, "throw new Error('noncanonical_iroha_chain_id')", 'exact transfer identity');
    requireLiteral(webIrohaAddress, "throw new Error('unsupported_iroha_chain_id')", 'exact address identity');
    for (const source of [webBaseApi, webState]) {
      requireLiteral(source, 'resolveCanonicalIrohaAddressNetwork', 'exact address routing');
    }
  });
  check('Android transport', () => {
    requireLiteral(androidNetworkModule, '.followRedirects(false)', 'HTTP redirect refusal');
    requireLiteral(androidNetworkModule, '.followSslRedirects(false)', 'HTTPS redirect refusal');
    requireLiteral(androidNetworkModule, 'irohaNoRedirectHttpClient(okHttpClient)', 'no-redirect client binding');
    for (const marker of ['parsed.userInfo != null', 'parsed.query != null', 'parsed.ref != null',
      'parsed.protocol != "https" && !(parsed.protocol == "http" && isLocal)',
      'val isLocal = parsed.host == "localhost" || parsed.host == "127.0.0.1"']) {
      requireLiteral(androidToriiRoutes, marker, 'safe endpoint validation');
    }
    requireLiteral(androidTorii, 'hasExactlyOnePayload', 'exclusive JSON-RPC result/error');
    requireLiteral(androidTorii, 'response.jsonrpc != "2.0" || response.id != request.id', 'JSON-RPC response binding');
  });
  check('Android account identity', () => {
    requireLiteral(androidIdentity, 'fun Chain.hasNonCanonicalUniversalWalletIrohaIdentity()', 'identity classifier');
    for (const source of [androidBalanceProvider, androidTransfer]) {
      requireLiteral(source, 'chain.hasNonCanonicalUniversalWalletIrohaIdentity()', 'noncanonical route refusal');
    }
    for (const source of [androidMetaAccount, androidMigration]) {
      if (source.includes('UniversalWalletRegistry.taira.id') || source.includes('UniversalWalletRegistry.nexus.id')) {
        fail('registry aliases must not select stored or migrated Iroha accounts');
      }
    }
  });
  check('iOS transport', () => {
    requireLiteral(iosTorii, 'IrohaNoRedirectHTTPTransport()', 'no-redirect client binding');
    requireLiteral(iosTorii, 'completionHandler(nil)', 'redirect refusal');
    for (const marker of ['url.user == nil', 'url.password == nil', 'url.query == nil', 'url.fragment == nil',
      'scheme == "https" || (scheme == "http" && isLocal)',
      'let isLocal = host == "localhost" || host == "127.0.0.1"']) {
      requireLiteral(iosToriiContract, marker, 'safe endpoint validation');
    }
    requireLiteral(iosTorii, 'hasExactlyOnePayload', 'exclusive JSON-RPC result/error');
    requireLiteral(iosTorii, 'response.jsonrpc == "2.0"', 'JSON-RPC response version');
    requireLiteral(iosTorii, 'response.id == .string(request.id)', 'JSON-RPC response binding');
  });
  check('iOS account identity', () => {
    requireLiteral(iosAddressResolver, 'exactIrohaNetwork(for: requestedChainId)', 'exact stored chain identity');
    requireLiteral(iosMigration, 'chainAccount(matchingExactly: Self.tairaChainIds)', 'exact migration identity');
    requireLiteral(iosSendContainer, 'isNonCanonicalIrohaProfile', 'noncanonical send refusal');
    requireLiteral(iosMetaAccountMapper, 'isNonCanonicalIrohaIdentity(chainId)', 'stored identity quarantine');
  });
  for (const [label, balance, markers] of [
    ['web', webBalance, ['item.account_id !== requestedAccountId',
      'isCanonicalIrohaAssetDefinitionId(this.getAssetId(item), network)',
      'seenScopes.has(scopeKey)', 'MAX_IROHA_NUMERIC = (1n << 511n) - 1n', 'sumCanonicalIrohaQuantities']],
    ['Android', androidBalance, ['if (item.accountId != address)',
      'IrohaToriiRoutes.normalizeAssetDefinitionId(presentItemAsset)',
      'seenAccountAssetScopes.add(canonicalItemAsset to canonicalScope)',
      'value > maxBalanceInPlanks.subtract(total)']],
    ['iOS', iosBalance, ['guard item.accountID == address',
      'IrohaToriiRoutes.normalizeAssetDefinitionId(item.asset)',
      'seenAssetScopes.insert("\\(canonicalAsset)\\u{0}\\(canonicalScope)").inserted',
      'value <= maxBalanceInPlanks - total']],
  ]) check(`${label} balance identity and arithmetic`, () => {
    for (const marker of markers) requireLiteral(balance, marker, 'strict account/asset/scope and bounded quantity contract');
  });
  for (const [label, history, markers] of [
    ['web', webHistory, ["if (transactionStatus !== 'Committed')", 'scaledIrohaIntegerToBaseUnits', 'fee: null']],
    ['Android', androidHistory, ['if (transactionStatus != "Committed")',
      'val outgoing = sourceAccount == accountAddress', 'fee = null']],
    ['iOS', iosHistory, ['guard transactionStatus == "Committed"',
      'let outgoing = sourceAccount == accountAddress', 'fees: []']],
  ]) check(`${label} history integrity`, () => {
    for (const marker of markers) requireLiteral(history, marker, 'committed exact-account history and unknown fee handling');
    for (const retired of ['r#box', 'source?.contains(accountAddress)', 'source?.includes(address)']) {
      if (history.includes(retired)) fail(`history still accepts retired field or substring identity ${retired}`);
    }
  });
  if (failures.length > 0) fail(`wallet Taira source checks failed:\n  - ${failures.join('\n  - ')}`);
}

function parseJsonBody(response, label) {
  try {
    return JSON.parse(response.body.toString('utf8'));
  } catch {
    fail(`${label} must return valid JSON`);
  }
}

function requireMediaType(headers, expected, label) {
  const contentType = headers['content-type'];
  if (typeof contentType !== 'string' || contentType.split(';', 1)[0].trim().toLowerCase() !== expected) {
    fail(`${label} must return Content-Type ${expected}`);
  }
}

function headerCount(headers, name) {
  const value = headers[name];
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    fail(`Taira response is missing valid ${name}`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) fail(`Taira response has unsafe ${name}`);
  return count;
}

function assertCompleteFanout(headers) {
  const attempted = headerCount(headers, 'x-iroha-fanout-routes-attempted');
  const succeeded = headerCount(headers, 'x-iroha-fanout-routes-succeeded');
  const failed = headerCount(headers, 'x-iroha-fanout-routes-failed');
  const denied = headerCount(headers, 'x-iroha-fanout-routes-denied');
  const unavailable = headerCount(headers, 'x-iroha-fanout-routes-unavailable');
  const notFound = headerCount(headers, 'x-iroha-fanout-routes-not-found');

  if (attempted < 1 || succeeded !== attempted || failed !== 0 || denied !== 0 || unavailable !== 0 || notFound !== 0) {
    fail(
      `Taira fanout is incomplete: attempted=${attempted} succeeded=${succeeded} failed=${failed} denied=${denied} unavailable=${unavailable} not_found=${notFound}`
    );
  }
}

function assertCompleteRouting(headers) {
  const fanoutNames = Object.keys(headers).filter((name) => name.startsWith('x-iroha-fanout-routes-'));
  if (fanoutNames.length > 0) {
    assertCompleteFanout(headers);
    return;
  }
  // Current public catalogue reads are served by the routed public dataspace.
  // Absence of fanout counters is valid only with explicit route evidence.
  if (headers['x-iroha-route-lane-id'] !== '0' ||
      headers['x-iroha-route-dataspace-id'] !== '0' ||
      !['local', 'proxy', 'external'].includes(headers['x-iroha-routed-by'])) {
    fail('Taira catalogue response lacks complete public-dataspace routing evidence');
  }
}

function validateStatus(status, expectedCommit, now = Date.now()) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) fail('Taira /status must return an object');
  const failures = [];
  // /status no longer includes chain_id. If a deployment supplies one, reject
  // a mismatch; canonical wallet identities are independently checked in source.
  if (status.chain_id !== undefined && status.chain_id !== TAIRA_CHAIN_ID) failures.push('chain_id does not match the canonical UUID');
  if (!Number.isSafeInteger(status.blocks) || status.blocks < 1) failures.push('blocks must be positive');
  // peers counts connected peers, not validators (and excludes the local node).
  if (!Number.isSafeInteger(status.peers) || status.peers < 0) failures.push('peers must be a nonnegative count');
  if (
    !Number.isSafeInteger(status.time_since_last_block_ms) ||
    status.time_since_last_block_ms < 0 ||
    status.time_since_last_block_ms > MAX_BLOCK_AGE_MS
  ) {
    failures.push('a block must have committed within the last 60 seconds');
  }
  if (
    !Number.isSafeInteger(status.last_block_committed_at_ms) ||
    status.last_block_committed_at_ms < now - MAX_BLOCK_AGE_MS ||
    status.last_block_committed_at_ms > now + 30_000
  ) {
    failures.push('last_block_committed_at_ms is stale or in the future');
  }
  if (status?.build?.git_commit_sha !== expectedCommit) {
    failures.push('build.git_commit_sha does not match TAIRA_EXPECTED_BUILD_COMMIT');
  }

  if (failures.length > 0) fail(`Taira /status failed release checks: ${[...new Set(failures)].join('; ')}`);
}

function validateAssetDefinitions(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  const definitions = items.filter((item) => item?.id === TAIRA_XOR_ASSET_ID);

  if (
    body?.next_cursor !== null ||
    !Number.isSafeInteger(body?.total) ||
    body.total !== items.length ||
    new Set(items.map((item) => item?.id)).size !== items.length ||
    definitions.length !== 1 ||
    definitions[0]?.spec?.scale !== TAIRA_XOR_SCALE
  ) {
    fail('live Taira must expose one complete canonical XOR snapshot with spec.scale 9');
  }
}

async function readAssetDefinitions(request = boundedRequest) {
  const items = [];
  const cursors = new Set();
  let cursor;
  let total;
  for (let page = 0; page < 20; page += 1) {
    const path = TAIRA_ASSET_DEFINITIONS_PATH + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const response = await request(path, { headers: { accept: 'application/json' } });
    requireMediaType(response.headers, 'application/json', 'Taira asset definitions');
    assertCompleteRouting(response.headers);
    const body = parseJsonBody(response, 'Taira asset definitions');
    if (!Array.isArray(body?.items) || !Number.isSafeInteger(body.total) || body.total < 0 ||
        (total !== undefined && total !== body.total) || !Object.hasOwn(body, 'next_cursor')) {
      fail('Taira asset definitions returned an inconsistent cursor page');
    }
    total = body.total;
    items.push(...body.items);
    if (body.next_cursor === null) {
      validateAssetDefinitions({ items, total, next_cursor: null });
      return;
    }
    cursor = body.next_cursor;
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/u.test(cursor) || cursors.has(cursor)) {
      fail('Taira asset definitions returned an invalid or repeated cursor');
    }
    cursors.add(cursor);
  }
  fail('Taira asset-definition cursor traversal exceeded its page bound');
}

function toolsListRequest() {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/list', params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
  return {
    body,
    headers: {
      accept: 'application/json', 'content-length': Buffer.byteLength(body), 'content-type': 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION, 'Mcp-Method': 'tools/list',
    },
    method: 'POST',
  };
}

function validateToolsList(body) {
  if (body?.jsonrpc !== '2.0' || body?.id !== 1 || !body?.result || body.error !== undefined) {
    fail('Taira MCP tools/list returned an invalid JSON-RPC envelope');
  }
  const tool = Array.isArray(body.result.tools)
    ? body.result.tools.find((candidate) => candidate?.name === 'iroha.transactions.submit_and_wait')
    : undefined;
  const required = tool?.inputSchema?.required;
  const properties = tool?.inputSchema?.properties;

  if (
    !tool ||
    tool.inputSchema?.additionalProperties !== false ||
    !Array.isArray(required) ||
    required.length !== 1 ||
    required[0] !== 'body_base64' ||
    !properties ||
    typeof properties !== 'object' ||
    !Object.hasOwn(properties, 'body_base64') ||
    !Object.hasOwn(properties, 'hash') ||
    Object.hasOwn(properties, 'signed_tx_base64') ||
    Object.hasOwn(properties, 'terminal_statuses')
  ) {
    fail('Taira MCP must expose iroha.transactions.submit_and_wait with required body_base64');
  }
}

function boundedRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(path, TAIRA_ORIGIN);
  if (url.origin !== TAIRA_ORIGIN || url.protocol !== 'https:') fail(`unsafe Taira audit URL: ${url}`);

  return new Promise((resolveRequest, rejectRequest) => {
    let request;
    let response;
    let settled = false;
    const rejectAndClose = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      response?.destroy();
      request?.destroy();
      rejectRequest(error);
    };
    // Socket timeouts measure inactivity; an absolute deadline also bounds DNS,
    // connection setup, and responses that continuously trickle body bytes.
    const deadline = setTimeout(
      () => rejectAndClose(new AuditError(`Taira ${path} timed out`)),
      10_000
    );
    try {
      request = https.request(
        url,
        {
          agent: false,
          headers: { 'user-agent': 'fearless-taira-release-audit/1', ...headers },
          method,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          timeout: 10_000,
        },
        (incoming) => {
          response = incoming;
          response.on('error', rejectAndClose);
          response.on('aborted', () => rejectAndClose(new AuditError(`Taira ${path} response was aborted`)));
          response.on('close', () => {
            if (!response.complete) {
              rejectAndClose(new AuditError(`Taira ${path} response ended prematurely`));
            }
          });
          if (settled) {
            response.destroy();
            return;
          }
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            rejectAndClose(new AuditError(`Taira ${path} returned HTTP ${status}`));
            return;
          }
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            if (settled) return;
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              rejectAndClose(new AuditError(`Taira ${path} response exceeded ${MAX_RESPONSE_BYTES} bytes`));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (settled) return;
            if (!response.complete) {
              rejectAndClose(new AuditError(`Taira ${path} response ended prematurely`));
              return;
            }
            settled = true;
            clearTimeout(deadline);
            resolveRequest({ body: Buffer.concat(chunks), headers: response.headers, status });
          });
        }
      );
      request.on('timeout', () => rejectAndClose(new AuditError(`Taira ${path} timed out`)));
      request.on('error', rejectAndClose);
      if (body !== undefined) request.write(body);
      request.end();
    } catch (error) {
      rejectAndClose(error);
    }
  });
}

async function runLiveAudit(expectedCommit) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(expectedCommit) || /^(.)\1+$/u.test(expectedCommit)) {
    fail('TAIRA_EXPECTED_BUILD_COMMIT must be a non-placeholder 40- or 64-character lowercase commit');
  }

  const checks = [
    ['health', async () => {
      const health = await boundedRequest('/health', { headers: { accept: 'text/plain' } });
      requireMediaType(health.headers, 'text/plain', 'Taira /health');
      if (health.body.toString('utf8').trim() !== 'Healthy') fail('Taira /health did not return Healthy');
    }],
    ['status', async () => {
      const response = await boundedRequest('/status', { headers: { accept: 'application/json' } });
      requireMediaType(response.headers, 'application/json', 'Taira /status');
      validateStatus(parseJsonBody(response, 'Taira /status'), expectedCommit);
    }],
    ['asset definitions', () => readAssetDefinitions()],
    ['MCP tool contract', async () => {
      const response = await boundedRequest('/v1/mcp', toolsListRequest());
      requireMediaType(response.headers, 'application/json', 'Taira MCP tools/list');
      validateToolsList(parseJsonBody(response, 'Taira MCP tools/list'));
    }],
  ];
  const results = await Promise.all(
    checks.map(async ([label, check]) => {
      try {
        await check();
        return null;
      } catch (error) {
        return `${label}: ${boundedDiagnostic(error)}`;
      }
    })
  );
  const failures = results.filter((result) => result !== null);
  if (failures.length > 0) fail(`live Taira release checks failed:\n  - ${failures.join('\n  - ')}`);
}

function parseArgs(argv) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const options = {
    live: false,
    root: resolve(scriptDir, '..'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--live') options.live = true;
    else if (argument === '--root' && argv[index + 1]) options.root = resolve(argv[++index]);
    else fail(`unknown or incomplete argument: ${argument}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  runStaticAudit(options);

  if (options.live) await runLiveAudit(process.env.TAIRA_EXPECTED_BUILD_COMMIT ?? '');

  process.stdout.write(`[taira-readiness] ${options.live ? 'static and live' : 'static'} audit passed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof AuditError ? error.message : 'unexpected Taira release audit failure';
    process.stderr.write(`[taira-readiness][error] ${message}\n`);
    process.exitCode = 1;
  });
}

export {
  AuditError,
  TAIRA_ASSET_DEFINITIONS_PATH,
  assertCompleteFanout,
  assertCompleteRouting,
  boundedRequest,
  readAssetDefinitions,
  runLiveAudit,
  runStaticAudit,
  validateAssetDefinitions,
  validateStatus,
  validateToolsList,
  toolsListRequest,
};
