import axios from 'axios';
import { Interface, makeError } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEvmTokenListFetcher,
  EVM_TOKEN_LIST_CACHE_MS,
  EVM_TOKEN_SCAN_INTERVAL_MS,
  EVM_TOKEN_SCAN_REFRESH_MS,
  EVM_TOKEN_SCAN_RETRY_MS,
  EvmTokenDiscoveryService,
  type EvmTokenDiscoveryState,
} from '@extension-base/services/evm-token-discovery';
import {
  decodeBalanceResults,
  encodeBalanceCalls,
  isSplittableMulticallError,
  MULTICALL3_ADDRESS,
  readTokenBalancesDirectly,
  readTokenBalancesWithMulticall,
} from '@extension-base/services/evm-token-discovery/multicall';
import {
  checksumEvmAddress,
  MAX_LISTED_TOKENS,
  parseEvmTokenList,
  parseEvmTokenListIndex,
  sanitizeTokenText,
} from '@extension-base/services/evm-token-discovery/tokenList';

const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
]);
const erc20 = new Interface(['function balanceOf(address owner) view returns (uint256)']);

const OWNER = '0x1111111111111111111111111111111111111111';
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;

const list = (tokens: unknown[], overrides: Record<string, unknown> = {}) => ({
  format: 'fearless-evm-token-list',
  version: 1,
  chainId: '1',
  network: 'Ethereum',
  tokens,
  ...overrides,
});

/** Answers aggregate3 like Multicall3 does, with the balances of `holdings` and a failed call for `reverting`. */
function multicallNode(holdings: Record<string, bigint>, reverting = new Set<string>()) {
  return vi.fn(async (data: string) => {
    const [calls] = multicall.decodeFunctionData('aggregate3', data) as unknown as [{ target: string; callData: string }[]];

    return multicall.encodeFunctionResult('aggregate3', [
      calls.map(({ target, callData }) => {
        const [owner] = erc20.decodeFunctionData('balanceOf', callData);

        expect(owner.toLowerCase()).toBe(OWNER);
        if (reverting.has(target.toLowerCase())) return { success: false, returnData: '0x' };

        return { success: true, returnData: word(holdings[target.toLowerCase()] ?? 0n) };
      }),
    ]);
  });
}

const addresses = (count: number) =>
  Array.from({ length: count }, (_, index) => `0x${(index + 1).toString(16).padStart(40, '0')}`);

describe('the token list a network reads', () => {
  it('keeps every valid token, checksummed, and reads names and symbols as plain printable text', () => {
    const tokens = parseEvmTokenList(
      list([
        [UNI.toLowerCase(), 'UNI', 'Uniswap', 18],
        [LINK, ' LI\u202eNK\u0000 ', 'Chain\u200blink   Token', 18],
      ]),
      '1'
    );

    expect(tokens).toEqual([
      { address: UNI, symbol: 'UNI', name: 'Uniswap', decimals: 18 },
      { address: LINK, symbol: 'LINK', name: 'Chainlink Token', decimals: 18 },
    ]);
  });

  it('leaves out malformed entries and repeated addresses instead of refusing the whole list', () => {
    const tokens = parseEvmTokenList(
      list([
        ['0x1234', 'BAD', 'Short address', 18],
        [UNI, '', 'No symbol', 18],
        [UNI, '\u200b', 'Invisible symbol', 18],
        [LINK, 'LINK', 'Too many decimals', 37],
        [LINK, 'LINK', 'Negative decimals', -1],
        [LINK, 'LINK', 'Fractional decimals', 6.5],
        [LINK, 'LINK', 'Decimals as text', '18'],
        { address: LINK },
        [UNI, 'UNI', '', 18],
        [UNI.toLowerCase(), 'UNI2', 'Repeated', 18],
      ]),
      '1'
    );

    // A name left empty takes the symbol.
    expect(tokens).toEqual([{ address: UNI, symbol: 'UNI', name: 'UNI', decimals: 18 }]);
  });

  it('refuses a document of another format, version or network', () => {
    expect(() => parseEvmTokenList(list([], { format: 'other' }), '1')).toThrow('evm_token_list_format');
    expect(() => parseEvmTokenList(list([], { version: 2 }), '1')).toThrow('evm_token_list_format');
    expect(() => parseEvmTokenList(list([], { tokens: {} }), '1')).toThrow('evm_token_list_format');
    expect(() => parseEvmTokenList(list([]), '56')).toThrow('evm_token_list_chain');
    expect(() => parseEvmTokenList(null, '1')).toThrow('evm_token_list_format');
    expect(() => parseEvmTokenList([], '1')).toThrow('evm_token_list_format');
  });

  it(`reads at most ${MAX_LISTED_TOKENS} tokens`, () => {
    const many = addresses(MAX_LISTED_TOKENS + 10).map((address, index) => [address, `T${index}`, `Token ${index}`, 18]);

    expect(parseEvmTokenList(list(many), '1')).toHaveLength(MAX_LISTED_TOKENS);
  });

  it('cuts long symbols and names, and checks addresses by their checksum', () => {
    expect(sanitizeTokenText('A'.repeat(40), 24)).toHaveLength(24);
    expect(sanitizeTokenText(42, 24)).toBe('');
    expect(checksumEvmAddress(UNI.toLowerCase())).toBe(UNI);
    expect(checksumEvmAddress('0xzz9840a85d5aF5bf1D1762F925BDADdC4201F984')).toBeUndefined();
    expect(checksumEvmAddress(undefined)).toBeUndefined();
  });

  it('names the networks that have a list in its index, and refuses an index of another format', () => {
    const index = { format: 'fearless-evm-token-lists', version: 1, lists: { 1: {}, 56: {}, oops: {} } };

    expect([...parseEvmTokenListIndex(index)].sort()).toEqual(['1', '56']);
    expect(() => parseEvmTokenListIndex({ ...index, version: 2 })).toThrow('evm_token_list_index_format');
    expect(() => parseEvmTokenListIndex({ ...index, lists: [] })).toThrow('evm_token_list_index_format');
  });
});

describe('reading many token balances through Multicall3', () => {
  it('encodes one balanceOf per token and decodes each answer, a failed call as unknown rather than zero', () => {
    const data = encodeBalanceCalls(OWNER, [UNI, LINK]);
    const [calls] = multicall.decodeFunctionData('aggregate3', data) as unknown as [
      { target: string; allowFailure: boolean; callData: string }[],
    ];

    expect(calls.map(({ target, allowFailure }) => [target, allowFailure])).toEqual([[UNI, true], [LINK, true]]);
    expect(erc20.decodeFunctionData('balanceOf', calls[0].callData)[0]).toBe(OWNER);

    const answer = multicall.encodeFunctionResult('aggregate3', [
      [
        { success: true, returnData: word(5n) },
        { success: false, returnData: word(9n) },
      ],
    ]);
    expect(decodeBalanceResults(answer, 2)).toEqual([5n, undefined]);
    expect(() => decodeBalanceResults(answer, 3)).toThrow('multicall_result_count');

    const short = multicall.encodeFunctionResult('aggregate3', [[{ success: true, returnData: '0x01' }]]);
    expect(decodeBalanceResults(short, 1)).toEqual([undefined]);
  });

  it('reads a long list a chunk at a time', async () => {
    const tokens = addresses(7);
    const call = multicallNode({ [tokens[2]]: 3n, [tokens[6]]: 7n });

    const balances = await readTokenBalancesWithMulticall({ call, owner: OWNER, tokens, chunkSize: 3 });

    expect(call).toHaveBeenCalledTimes(3);
    expect(balances.get(tokens[2])).toBe(3n);
    expect(balances.get(tokens[6])).toBe(7n);
    expect(balances.get(tokens[0])).toBe(0n);
    expect(balances.size).toBe(7);
  });

  it('asks again in halves when a node refuses a call that large, down to the smallest chunk', async () => {
    const tokens = addresses(8);
    const node = multicallNode({ [tokens[7]]: 8n }, new Set([tokens[1]]));
    const call = vi.fn(async (data: string) => {
      const [calls] = multicall.decodeFunctionData('aggregate3', data) as unknown as [unknown[]];

      if (calls.length > 2) throw makeError('server response 413 Payload Too Large', 'SERVER_ERROR', { request: undefined as never });

      return node(data);
    });

    const balances = await readTokenBalancesWithMulticall({ call, owner: OWNER, tokens, chunkSize: 8, minChunkSize: 2 });

    expect(balances.get(tokens[7])).toBe(8n);
    expect(balances.get(tokens[1])).toBeUndefined();
    expect(balances.has(tokens[1])).toBe(true);
    // 8 refused, 4 + 4 refused, then four calls of 2.
    expect(call).toHaveBeenCalledTimes(7);

    const refusing = vi.fn(async () => {
      throw makeError('execution reverted', 'CALL_EXCEPTION', { action: 'call', data: '0x', reason: null, transaction: { to: null, data: '' }, invocation: null, revert: null });
    });
    await expect(readTokenBalancesWithMulticall({ call: refusing, owner: OWNER, tokens, chunkSize: 8, minChunkSize: 4 })).rejects.toThrow();
    expect(refusing).toHaveBeenCalledTimes(2);
  });

  it('does not ask a node that is down or rate limiting again, so a scan that cannot finish fails at once', async () => {
    const timeout = vi.fn(async () => {
      throw new Error('evm_balance_timeout');
    });
    await expect(readTokenBalancesWithMulticall({ call: timeout, owner: OWNER, tokens: addresses(200), minChunkSize: 10 })).rejects.toThrow(
      'evm_balance_timeout'
    );
    expect(timeout).toHaveBeenCalledTimes(1);

    expect(isSplittableMulticallError(makeError('server response 429 Too Many Requests', 'SERVER_ERROR', { request: undefined as never }))).toBe(false);
    expect(isSplittableMulticallError(new Error('rate limit exceeded, response size exceeded'))).toBe(false);
    expect(isSplittableMulticallError(new Error('out of gas'))).toBe(true);
    expect(isSplittableMulticallError({ info: { error: { message: 'not enough step counters to continue the execution' } } })).toBe(true);
    expect(isSplittableMulticallError({ error: { message: 'response size exceeded' } })).toBe(true);
    expect(isSplittableMulticallError(new Error('ECONNRESET'))).toBe(false);
  });

  it('reads tokens one call each without Multicall3, and fails only when no call was answered', async () => {
    const call = vi.fn(async (to: string, data: string) => {
      expect(erc20.decodeFunctionData('balanceOf', data)[0]).toBe(OWNER);
      if (to === LINK) throw makeError('execution reverted', 'CALL_EXCEPTION', { action: 'call', data: '0x', reason: null, transaction: { to: null, data: '' }, invocation: null, revert: null });

      return word(4n);
    });

    const balances = await readTokenBalancesDirectly({ call, owner: OWNER, tokens: [UNI, LINK] });
    expect(balances.get(UNI.toLowerCase())).toBe(4n);
    expect(balances.get(LINK.toLowerCase())).toBeUndefined();

    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(readTokenBalancesDirectly({ call: down, owner: OWNER, tokens: [UNI, LINK] })).rejects.toThrow('ECONNREFUSED');
    await expect(readTokenBalancesDirectly({ call: down, owner: OWNER, tokens: [] })).resolves.toEqual(new Map());
    expect(MULTICALL3_ADDRESS).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
  });
});

function discovery({
  stored,
  files = {},
  wallets,
}: { stored?: unknown; files?: Record<string, unknown>; wallets?: string[] } = {}) {
  let now = 1_000_000_000_000;
  const writes: EvmTokenDiscoveryState[] = [];
  const fetchListFile = vi.fn(async (name: string) => {
    const file = files[name];

    if (file instanceof Error) throw file;
    return file;
  });
  const service = new EvmTokenDiscoveryService({
    fetchListFile,
    readState: async () => stored,
    writeState: async (state) => {
      writes.push(state);
    },
    getWalletKeys: wallets ? () => wallets : undefined,
    now: () => now,
  });

  return {
    service,
    writes,
    fetchListFile,
    advance: (ms: number) => {
      now += ms;
    },
    get now() {
      return now;
    },
  };
}

const INDEX = { format: 'fearless-evm-token-lists', version: 1, lists: { 1: { tokens: 1 } } };

describe('when a wallet reads its token list on a network', () => {
  it('reads it on the first read, then once a day', async () => {
    const fixture = discovery();

    expect(await fixture.service.isScanDue('wallet', '1')).toBe(true);
    await fixture.service.recordScan('wallet', '1', true);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(false);

    fixture.advance(EVM_TOKEN_SCAN_INTERVAL_MS - 1);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(false);
    fixture.advance(1);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(true);
    // Another wallet, or another network, has its own time.
    expect(await fixture.service.isScanDue('other', '1')).toBe(true);
  });

  it('reads it again on Refresh only when the last read began more than five minutes ago', async () => {
    const fixture = discovery();

    await fixture.service.recordScan('wallet', '1', true);
    expect(await fixture.service.isScanDue('wallet', '1', true)).toBe(false);
    fixture.advance(EVM_TOKEN_SCAN_REFRESH_MS);
    expect(await fixture.service.isScanDue('wallet', '1', true)).toBe(true);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(false);
  });

  it('tries a failed read again ten minutes later, and keeps the last success meanwhile', async () => {
    const fixture = discovery();

    await fixture.service.recordScan('wallet', '1', true);
    const succeededAt = fixture.now;
    fixture.advance(EVM_TOKEN_SCAN_INTERVAL_MS);
    await fixture.service.recordScan('wallet', '1', false);
    expect(fixture.writes.at(-1)?.scans.wallet['1']).toEqual({ scannedAt: succeededAt, failedAt: fixture.now });

    fixture.advance(EVM_TOKEN_SCAN_RETRY_MS - 1);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(false);
    fixture.advance(1);
    expect(await fixture.service.isScanDue('wallet', '1')).toBe(true);

    await fixture.service.recordScan('wallet', '1', true);
    expect(fixture.writes.at(-1)?.scans.wallet['1']).toEqual({ scannedAt: fixture.now });
  });

  it('reads it at once when the clock went back', async () => {
    const fixture = discovery({ stored: { version: 1, scans: { wallet: { 1: { scannedAt: 2_000_000_000_000 } } } } });

    expect(await fixture.service.isScanDue('wallet', '1')).toBe(true);
  });

  it('keeps the times across a restart, and starts over from a stored state it cannot read', async () => {
    const first = discovery();
    await first.service.recordScan('wallet', '1', true);
    const stored = first.writes.at(-1);

    const restarted = discovery({ stored });
    restarted.advance(1000);
    expect(await restarted.service.isScanDue('wallet', '1')).toBe(false);

    for (const damaged of [undefined, 'text', { version: 2, scans: {} }, { version: 1, scans: null }]) {
      expect(await discovery({ stored: damaged }).service.isScanDue('wallet', '1')).toBe(true);
    }

    const partly = discovery({ stored: { version: 1, scans: { wallet: { 1: { scannedAt: 'soon', failedAt: -5 } }, broken: 7 } } });
    expect(await partly.service.isScanDue('wallet', '1')).toBe(true);
    await partly.service.recordScan('wallet', '56', true);
    expect(partly.writes.at(-1)?.scans).toEqual({ wallet: { 1: {}, 56: { scannedAt: partly.now } } });
  });

  it('forgets a removed wallet at the next write', async () => {
    const fixture = discovery({
      stored: { version: 1, scans: { gone: { 1: { scannedAt: 1 } }, kept: { 1: { scannedAt: 1 } } } },
      wallets: ['kept', 'wallet'],
    });

    await fixture.service.recordScan('wallet', '1', true);

    expect(Object.keys(fixture.writes.at(-1)?.scans ?? {}).sort()).toEqual(['kept', 'wallet']);
  });

  it('reads a state that failed to load as none', async () => {
    const service = new EvmTokenDiscoveryService({
      fetchListFile: vi.fn(),
      readState: () => Promise.reject(new Error('storage')),
      writeState: vi.fn().mockRejectedValue(new Error('quota')),
    });

    expect(await service.isScanDue('wallet', '1')).toBe(true);
    // A write that fails is not the read's failure.
    await expect(service.recordScan('wallet', '1', true)).resolves.toBeUndefined();
    expect(await service.isScanDue('wallet', '1')).toBe(false);
  });
});

describe('the lists a wallet fetches', () => {
  const ethereum = list([[UNI, 'UNI', 'Uniswap', 18]]);

  it('fetches only the lists its index names, and each once for six hours', async () => {
    const fixture = discovery({ files: { 'index.json': INDEX, '1.json': ethereum } });

    expect(await fixture.service.getTokens('56')).toBeUndefined();
    expect(await fixture.service.getTokens('1')).toEqual([{ address: UNI, symbol: 'UNI', name: 'Uniswap', decimals: 18 }]);
    await fixture.service.getTokens('1');
    expect(fixture.fetchListFile.mock.calls.map(([name]) => name)).toEqual(['index.json', '1.json']);

    fixture.advance(EVM_TOKEN_LIST_CACHE_MS);
    await fixture.service.getTokens('1');
    expect(fixture.fetchListFile.mock.calls.map(([name]) => name)).toEqual(['index.json', '1.json', 'index.json', '1.json']);
  });

  it('asks again after a failed fetch, and fails when a list the index names is missing', async () => {
    const files: Record<string, unknown> = { 'index.json': new Error('offline') };
    const fixture = discovery({ files });

    await expect(fixture.service.getTokens('1')).rejects.toThrow('offline');
    files['index.json'] = INDEX;
    await expect(fixture.service.getTokens('1')).rejects.toThrow('evm_token_list_missing');
    files['1.json'] = { format: 'wrong' };
    await expect(fixture.service.getTokens('1')).rejects.toThrow('evm_token_list_format');
    files['1.json'] = ethereum;
    await expect(fixture.service.getTokens('1')).resolves.toHaveLength(1);
  });

  it('has no lists when the index does not exist yet', async () => {
    const fixture = discovery({ files: {} });

    expect(await fixture.service.getTokens('1')).toBeUndefined();
    expect(fixture.fetchListFile).toHaveBeenCalledTimes(1);
  });
});

describe('fetching a list file', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches only list names from the lists folder, and reads a missing file as none', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValueOnce({ status: 200, data: INDEX }).mockResolvedValueOnce({ status: 404, data: 'Not Found' });
    const fetch = createEvmTokenListFetcher('https://example.test/tokens/evm/v1');

    await expect(fetch('index.json')).resolves.toEqual(INDEX);
    await expect(fetch('56.json')).resolves.toBeUndefined();
    await expect(fetch('../chains.json')).rejects.toThrow('evm_token_list_name');
    await expect(fetch('1.json?address=0x1')).rejects.toThrow('evm_token_list_name');

    expect(get.mock.calls.map(([url]) => url)).toEqual(['https://example.test/tokens/evm/v1/index.json', 'https://example.test/tokens/evm/v1/56.json']);
    const options = get.mock.calls[0][1]!;
    expect(options.validateStatus?.(404)).toBe(true);
    expect(options.validateStatus?.(500)).toBe(false);
  });
});
