#!/usr/bin/env node
/**
 * Builds the ERC-20 token lists the wallet reads to find tokens outside the registry (docs/evm-token-discovery.md):
 * remote-config/production/tokens/evm/v1/<chainId>.json and index.json.
 *
 * The sources are the pinned, MIT-licensed public lists in scripts/evm-token-list-sources.json. A token is kept only
 * when it answers `decimals()` and `balanceOf(address)` on chain, read through Multicall3 on the registry's own node for
 * its network; the chain's decimals replace the lists'. Registry assets are left out, as the registry path reads them.
 * The same sources and chain state always give the same bytes: there are no timestamps.
 *
 *   node scripts/generate-evm-token-lists.mjs           write the files
 *   node scripts/generate-evm-token-lists.mjs --check   exit 1 when the files differ from what would be written
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, Interface } from 'ethers';

export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const LIST_FORMAT = 'fearless-evm-token-list';
export const INDEX_FORMAT = 'fearless-evm-token-lists';
export const LIST_VERSION = 1;
export const MAX_SYMBOL_LENGTH = 24;
export const MAX_NAME_LENGTH = 64;
export const MAX_DECIMALS = 36;
export const MAX_TOKENS_PER_CHAIN = 5000;
/** Calls per aggregate3 while checking tokens: each token is two calls. */
const CHECK_CHUNK = 300;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
]);
const erc20 = new Interface([
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
]);

// Control characters, zero-width and bidirectional formatting characters: a symbol must read as what it is.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu;

/** Printable text of at most `max` characters, or '' when nothing printable is left. */
export function sanitizeText(value, max) {
  if (typeof value !== 'string') return '';

  const text = value.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();

  return [...text].slice(0, max).join('').trim();
}

/** The checksummed address, or undefined for anything that is not a 20-byte hex address. */
export function checksumAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(value)) return undefined;

  try {
    return getAddress(value.toLowerCase());
  } catch {
    return undefined;
  }
}

/** The tokens of one fetched list document: a token list ({ tokens }) or a bare array of tokens. */
export function tokensOf(document, chainIdOverride) {
  const rows = Array.isArray(document) ? document : Array.isArray(document?.tokens) ? document.tokens : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];

    const chainId = String(chainIdOverride ?? row.chainId ?? '').trim();
    const address = checksumAddress(row.address);
    const symbol = sanitizeText(row.symbol, MAX_SYMBOL_LENGTH);
    const name = sanitizeText(row.name, MAX_NAME_LENGTH) || symbol;

    if (!/^\d+$/u.test(chainId) || !address || !symbol) return [];
    // A list's own chain id wins over the override when it names another chain.
    if (chainIdOverride !== undefined && row.chainId !== undefined && String(row.chainId) !== chainId) return [];

    return [{ chainId, address, symbol, name }];
  });
}

/** The production EVM networks of the registry, by chain id, with their asset ids in lower case. */
export function productionEvmNetworks(chains) {
  const networks = new Map();

  for (const network of Array.isArray(chains) ? chains : []) {
    if (network?.ecosystem !== 'ethereum' || network.disabled) continue;
    if ((network.options ?? []).some((option) => String(option).toLowerCase() === 'testnet')) continue;

    networks.set(String(network.chainId), {
      chainId: String(network.chainId),
      name: String(network.name),
      registryIds: new Set((network.assets ?? []).map(({ id }) => String(id).toLowerCase())),
      nodes: (network.nodes ?? []).map(({ url }) => url).filter((url) => typeof url === 'string' && url.startsWith('https://')),
    });
  }

  return networks;
}

/**
 * One candidate per (chain, address), in source order: the first source that lists a token names it. Tokens of other
 * chains and the registry's own assets are left out.
 */
export function mergeCandidates(sourceTokens, networks) {
  const byChain = new Map();

  for (const token of sourceTokens) {
    const network = networks.get(token.chainId);
    const key = token.address.toLowerCase();

    if (!network || network.registryIds.has(key)) continue;

    const tokens = byChain.get(token.chainId) ?? new Map();
    if (!tokens.has(key)) tokens.set(key, token);
    byChain.set(token.chainId, tokens);
  }

  return new Map([...byChain].map(([chainId, tokens]) => [chainId, [...tokens.values()]]));
}

/**
 * The aggregate3 call data that reads the native balance of `holder`, then `decimals()` and `balanceOf(holder)` of each
 * token, all in one block. `holder` should hold some of the native coin (the latest block's fee recipient does).
 */
export function encodeTokenChecks(addresses, holder) {
  const decimals = erc20.encodeFunctionData('decimals');
  const balanceOf = erc20.encodeFunctionData('balanceOf', [holder]);

  return multicall.encodeFunctionData('aggregate3', [
    [
      { target: MULTICALL3, allowFailure: false, callData: multicall.encodeFunctionData('getEthBalance', [holder]) },
      ...addresses.flatMap((target) => [
        { target, allowFailure: true, callData: decimals },
        { target, allowFailure: true, callData: balanceOf },
      ]),
    ],
  ]);
}

const word = (returnData) => (returnData.length >= 66 ? BigInt(returnData.slice(0, 66)) : undefined);

/**
 * Each token's decimals from the chain, or the reason it is dropped. A token whose `balanceOf` reports the holder's
 * native balance mirrors the native coin (OP Mainnet's legacy ETH at 0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000): the
 * wallet would show every native balance a second time as a found token.
 */
export function decodeTokenChecks(addresses, data) {
  const [results] = multicall.decodeFunctionResult('aggregate3', data);

  if (results.length !== addresses.length * 2 + 1) {
    throw new Error(`aggregate3 answered ${results.length} of ${addresses.length * 2 + 1} calls`);
  }

  const native = word(results[0].returnData);

  return addresses.map((address, index) => {
    const [decimalsCall, balanceCall] = [results[index * 2 + 1], results[index * 2 + 2]];
    const decimals = decimalsCall.success ? word(decimalsCall.returnData) : undefined;
    const balance = balanceCall.success ? word(balanceCall.returnData) : undefined;

    if (decimals === undefined) return { address, error: 'decimals() failed' };
    if (balance === undefined) return { address, error: 'balanceOf() failed' };
    if (decimals > BigInt(MAX_DECIMALS)) return { address, error: `decimals ${decimals} out of range` };
    if (native !== undefined && native > 0n && balance === native) return { address, error: 'mirrors the native coin' };

    return { address, decimals: Number(decimals) };
  });
}

/** One token per line, in address order, so a list's history reads as the tokens it gained or lost. */
export function renderList({ chainId, network, tokens }) {
  const rows = [...tokens]
    .sort((left, right) => left.address.toLowerCase().localeCompare(right.address.toLowerCase()))
    .map(({ address, symbol, name, decimals }) => `    ${JSON.stringify([address, symbol, name, decimals])}`);

  return [
    '{',
    `  "format": ${JSON.stringify(LIST_FORMAT)},`,
    `  "version": ${LIST_VERSION},`,
    `  "chainId": ${JSON.stringify(chainId)},`,
    `  "network": ${JSON.stringify(network)},`,
    '  "tokens": [',
    rows.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

export function renderIndex({ lists, sources }) {
  return `${JSON.stringify(
    {
      format: INDEX_FORMAT,
      version: LIST_VERSION,
      multicall3: MULTICALL3,
      lists: Object.fromEntries(
        [...lists]
          .sort((left, right) => Number(left.chainId) - Number(right.chainId))
          .map(({ chainId, network, tokens, sha256 }) => [chainId, { network, tokens, sha256 }])
      ),
      sources,
    },
    null,
    2
  )}\n`;
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

  const text = await response.text();

  if (text.length > MAX_SOURCE_BYTES) throw new Error(`${url}: larger than ${MAX_SOURCE_BYTES} bytes`);

  return text;
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const answer = await response.json();

  if (answer.error) throw new Error(`${method}: ${JSON.stringify(answer.error)}`);

  return answer.result;
}

/** The first registry node that answers for the expected chain and has Multicall3. */
async function nodeFor(network) {
  for (const url of network.nodes) {
    try {
      const [chainId, code] = await Promise.all([rpc(url, 'eth_chainId', []), rpc(url, 'eth_getCode', [MULTICALL3, 'latest'])]);

      if (BigInt(chainId) !== BigInt(network.chainId)) continue;
      if (typeof code !== 'string' || code === '0x') throw new Error(`${network.name}: no Multicall3 code at ${MULTICALL3}`);

      return url;
    } catch (error) {
      if (String(error?.message).includes('no Multicall3')) throw error;
    }
  }

  throw new Error(`${network.name}: no registry node answered`);
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * An address that holds some of the native coin: the latest block's fee recipient, or one of its senders. Polygon names
 * the zero address as fee recipient, and some tokens refuse `balanceOf` of the zero address.
 */
async function nativeHolder(url, network) {
  const block = await rpc(url, 'eth_getBlockByNumber', ['latest', true]);
  const candidates = [block.miner, ...(block.transactions ?? []).map(({ from }) => from)]
    .map(checksumAddress)
    .filter((address) => address && address !== ZERO_ADDRESS);

  for (const address of [...new Set(candidates)].slice(0, 10)) {
    if (BigInt(await rpc(url, 'eth_getBalance', [address, 'latest'])) > 0n) return address;
  }

  throw new Error(`${network.name}: no address of the latest block holds the native coin to compare with`);
}

async function checkOnChain(network, candidates, log) {
  const url = await nodeFor(network);
  const holder = await nativeHolder(url, network);
  const kept = [];
  const perCall = CHECK_CHUNK / 2;

  for (let start = 0; start < candidates.length; start += perCall) {
    const chunk = candidates.slice(start, start + perCall);
    const data = await rpc(url, 'eth_call', [
      { to: MULTICALL3, data: encodeTokenChecks(chunk.map(({ address }) => address), holder) },
      'latest',
    ]);

    decodeTokenChecks(chunk.map(({ address }) => address), data).forEach((result, index) => {
      if (result.error) log(`${network.name} ${result.address} ${chunk[index].symbol}: dropped, ${result.error}`);
      else kept.push({ ...chunk[index], decimals: result.decimals });
    });
  }

  return { url, kept };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const config = JSON.parse(await readFile(path.join(root, 'scripts/evm-token-list-sources.json'), 'utf8'));
  const chains = JSON.parse(await readFile(path.join(root, 'remote-config/production/chains/v13/chains.json'), 'utf8'));
  const outDir = path.join(root, 'remote-config/production/tokens/evm/v1');
  const networks = productionEvmNetworks(chains);
  const tokens = [];
  const sources = [];
  const dropped = [];

  for (const source of config.sources) {
    if (source.license !== 'MIT') throw new Error(`${source.id}: only MIT-licensed sources are used`);

    for (const list of source.lists) {
      const url = `${source.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${source.commit}/${list.path}`;
      const text = await fetchText(url);

      tokens.push(...tokensOf(JSON.parse(text), list.chainId));
      sources.push({ id: source.id, license: source.license, url, sha256: sha256(text) });
    }
  }

  const written = [];

  for (const [chainId, candidates] of [...mergeCandidates(tokens, networks)].sort(([left], [right]) => Number(left) - Number(right))) {
    const network = networks.get(chainId);
    const { url, kept } = await checkOnChain(network, candidates, (line) => dropped.push(line));

    if (kept.length > MAX_TOKENS_PER_CHAIN) throw new Error(`${network.name}: ${kept.length} tokens, more than ${MAX_TOKENS_PER_CHAIN}`);
    if (!kept.length) continue;

    const text = renderList({ chainId, network: network.name, tokens: kept });

    written.push({ chainId, network: network.name, tokens: kept.length, sha256: sha256(text), text });
    console.info(`${network.name} (${chainId}): ${kept.length} of ${candidates.length} tokens kept, checked on ${new URL(url).host}`);
  }

  const files = new Map(written.map(({ chainId, text }) => [`${chainId}.json`, text]));
  files.set('index.json', renderIndex({ lists: written, sources }));

  if (check) {
    const present = await readdir(outDir).catch(() => []);
    const differing = [];

    for (const name of new Set([...present, ...files.keys()])) {
      const current = await readFile(path.join(outDir, name), 'utf8').catch(() => undefined);
      if (current !== files.get(name)) differing.push(name);
    }
    if (differing.length) {
      console.error(`Token lists differ from the sources: ${differing.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.info(`Token lists match the sources (${files.size} files).`);
    }
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await Promise.all([...files].map(([name, text]) => writeFile(path.join(outDir, name), text)));
  if (dropped.length) console.info(`Dropped ${dropped.length} tokens that failed the on-chain check:\n${dropped.join('\n')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
