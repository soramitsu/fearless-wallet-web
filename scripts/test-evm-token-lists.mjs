// node --test scripts/test-evm-token-lists.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Interface } from 'ethers';
import {
  checksumAddress,
  decodeTokenChecks,
  encodeTokenChecks,
  mergeCandidates,
  MULTICALL3,
  productionEvmNetworks,
  renderIndex,
  renderList,
  sanitizeText,
  sha256,
  tokensOf,
} from './generate-evm-token-lists.mjs';

const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
]);
const erc20 = new Interface(['function decimals() view returns (uint8)', 'function balanceOf(address owner) view returns (uint256)']);
const word = (value) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const HOLDER = '0x4200000000000000000000000000000000000011';

test('symbols and names keep printable text only', () => {
  assert.equal(sanitizeText(' LI\u202eNK\u0000\u200b ', 24), 'LINK');
  assert.equal(sanitizeText('Chain   link\n Token', 64), 'Chain link Token');
  assert.equal(sanitizeText('x'.repeat(30), 24), 'x'.repeat(24));
  assert.equal(sanitizeText(7, 24), '');
});

test('addresses are checksummed, anything else is refused', () => {
  assert.equal(checksumAddress(UNI.toLowerCase()), UNI);
  assert.equal(checksumAddress('0x1234'), undefined);
  assert.equal(checksumAddress(null), undefined);
});

test('tokens come from a token list or a bare array, with the list chain id when the source names one', () => {
  const rows = [
    { chainId: 1, address: UNI.toLowerCase(), symbol: 'UNI', name: 'Uniswap', decimals: 18 },
    { chainId: 1, address: 'not an address', symbol: 'BAD', name: 'Bad' },
    { chainId: 1, address: LINK, symbol: '\u200b', name: 'No symbol' },
    { chainId: 'one', address: LINK, symbol: 'LINK', name: 'Chain id is not a number' },
    null,
    { chainId: 1, address: LINK, symbol: 'LINK' },
  ];

  assert.deepEqual(tokensOf({ tokens: rows }), [
    { chainId: '1', address: UNI, symbol: 'UNI', name: 'Uniswap' },
    { chainId: '1', address: LINK, symbol: 'LINK', name: 'LINK' },
  ]);
  assert.deepEqual(tokensOf(rows.slice(0, 1)).map(({ address }) => address), [UNI]);
  // Trust Wallet lists set chainId on some rows only: the override fills it, and a row of another chain is left out.
  assert.deepEqual(
    tokensOf({ tokens: [{ address: UNI, symbol: 'UNI', name: 'Uniswap' }, { chainId: 56, address: LINK, symbol: 'LINK', name: 'Link' }] }, '1'),
    [{ chainId: '1', address: UNI, symbol: 'UNI', name: 'Uniswap' }]
  );
  assert.deepEqual(tokensOf({ tokens: 'nope' }), []);
});

test('only production EVM networks get a list, and the registry assets are left out of it', () => {
  const networks = productionEvmNetworks([
    { name: 'Ethereum', chainId: '1', ecosystem: 'ethereum', assets: [{ id: USDT }], nodes: [{ url: 'https://a.example' }, { url: 'wss://a.example' }] },
    { name: 'Sepolia', chainId: '11155111', ecosystem: 'ethereum', options: ['testnet'], assets: [], nodes: [] },
    { name: 'Old', chainId: '9', ecosystem: 'ethereum', disabled: true, assets: [], nodes: [] },
    { name: 'Polkadot', chainId: 'abc', ecosystem: 'substrate', assets: [], nodes: [] },
  ]);

  assert.deepEqual([...networks.keys()], ['1']);
  assert.deepEqual(networks.get('1').nodes, ['https://a.example']);

  const merged = mergeCandidates(
    [
      { chainId: '1', address: UNI, symbol: 'UNI', name: 'Uniswap' },
      { chainId: '1', address: UNI, symbol: 'UNI-2', name: 'Second source' },
      { chainId: '1', address: USDT, symbol: 'USDT', name: 'Tether' },
      { chainId: '56', address: LINK, symbol: 'LINK', name: 'Link' },
    ],
    networks
  );

  assert.deepEqual([...merged.keys()], ['1']);
  assert.deepEqual(merged.get('1'), [{ chainId: '1', address: UNI, symbol: 'UNI', name: 'Uniswap' }]);
  assert.deepEqual(productionEvmNetworks('nope'), new Map());
});

test('the on-chain check keeps tokens that answer, with the chain decimals, and drops native mirrors', () => {
  const tokens = [UNI, LINK, USDT, '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000', '0x0000000000000000000000000000000000000001'];
  const data = encodeTokenChecks(tokens, HOLDER);
  const [calls] = multicall.decodeFunctionData('aggregate3', data);

  assert.equal(calls.length, tokens.length * 2 + 1);
  assert.equal(calls[0].target, MULTICALL3);
  assert.equal(multicall.decodeFunctionData('getEthBalance', calls[0].callData)[0], HOLDER);
  assert.equal(erc20.decodeFunctionData('balanceOf', calls[2].callData)[0], HOLDER);

  const answer = multicall.encodeFunctionResult('aggregate3', [
    [
      { success: true, returnData: word(5n * 10n ** 18n) },
      // UNI: 18 decimals, some balance.
      { success: true, returnData: word(18) },
      { success: true, returnData: word(1) },
      // LINK: decimals() reverts.
      { success: false, returnData: '0x' },
      { success: true, returnData: word(0) },
      // USDT: balanceOf answers nothing.
      { success: true, returnData: word(6) },
      { success: true, returnData: '0x' },
      // OP legacy ETH: reports the holder's native balance.
      { success: true, returnData: word(18) },
      { success: true, returnData: word(5n * 10n ** 18n) },
      // Decimals out of range.
      { success: true, returnData: word(77) },
      { success: true, returnData: word(0) },
    ],
  ]);

  assert.deepEqual(decodeTokenChecks(tokens, answer), [
    { address: UNI, decimals: 18 },
    { address: LINK, error: 'decimals() failed' },
    { address: USDT, error: 'balanceOf() failed' },
    { address: tokens[3], error: 'mirrors the native coin' },
    { address: tokens[4], error: 'decimals 77 out of range' },
  ]);
  assert.throws(() => decodeTokenChecks(tokens.slice(0, 2), answer), /answered 11 of 5 calls/);
});

test('a list is written one token per line in address order, and the index names its hash', () => {
  const text = renderList({
    chainId: '1',
    network: 'Ethereum',
    tokens: [
      { address: UNI, symbol: 'UNI', name: 'Uniswap', decimals: 18 },
      { address: LINK, symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
    ],
  });
  const document = JSON.parse(text);

  assert.deepEqual(document, {
    format: 'fearless-evm-token-list',
    version: 1,
    chainId: '1',
    network: 'Ethereum',
    tokens: [
      [UNI, 'UNI', 'Uniswap', 18],
      [LINK, 'LINK', 'ChainLink Token', 18],
    ],
  });
  assert.equal(text.split('\n').filter((line) => line.startsWith('    [')).length, 2);

  const index = JSON.parse(renderIndex({
    lists: [
      { chainId: '56', network: 'BNB Smart Chain', tokens: 1, sha256: 'b' },
      { chainId: '1', network: 'Ethereum', tokens: 2, sha256: sha256(text) },
    ],
    sources: [{ id: 'smoldapp', license: 'MIT', url: 'https://example/1.json', sha256: 'c' }],
  }));

  assert.deepEqual(Object.keys(index.lists), ['1', '56']);
  assert.equal(index.lists['1'].sha256, sha256(text));
  assert.equal(index.multicall3, MULTICALL3);
});

test('the lists in remote-config match their index', () => {
  const folder = new URL('../remote-config/production/tokens/evm/v1/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', folder), 'utf8'));

  for (const [chainId, entry] of Object.entries(index.lists)) {
    const text = readFileSync(new URL(`${chainId}.json`, folder), 'utf8');

    assert.equal(sha256(text), entry.sha256, chainId);
    assert.equal(JSON.parse(text).tokens.length, entry.tokens, chainId);
  }
  assert.ok(index.sources.every(({ license }) => license === 'MIT'));
});
