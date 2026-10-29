import { JsonRpcProvider, makeError } from 'ethers';
import { APIItemState } from '@extension-base/api/types/networks';
import EvmBalanceService, { isEvmNodeFailure } from '@extension-base/services/balance-service/EvmBalanceService';
import EvmContractService from '@extension-base/services/evm-contract-service';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import type State from '@extension-base/background/handlers/State';
import type { JsonRpcPayload, JsonRpcResult } from 'ethers';
import type { NetworkJson } from '@extension-base/types';

describe('EvmBalanceService', () => {
  it('skips a network whose EVM provider could not be initialized', async () => {
    const getEvmApi = vi.fn(() => undefined);
    const state = {
      currentAccount: { ethereumAddress: '0x1111111111111111111111111111111111111111' },
      getEvmApi,
      isReady: () => true,
      networkService: {
        networkValues: [
          {
            assets: [],
            ecosystem: 'ethereum',
            name: 'Ethereum',
          },
        ],
      },
    } as unknown as State;

    const service = new EvmBalanceService(state);

    await expect(service.fetchBalance({ networks: ['ethereum'] })).resolves.toEqual([]);
    expect(getEvmApi).toHaveBeenCalledWith('Ethereum');
  });
});

const ADDRESS = '0x1111111111111111111111111111111111111111';
const SUBSTRATE = '5GsGqbQ2692eBUzbAUznPr84ikvuFavYmkDXdQEndzHkMFaH';
const BLAST = 'https://optimism-mainnet.blastapi.io/';
const OP_PUBLIC = 'https://optimism.publicnode.com/';
const OP_TOKEN = '0x4200000000000000000000000000000000000042';

// OP Mainnet as a 4.2.2 profile has it: Blast first in the registry and saved as the current node.
function opMainnet(nodes = [BLAST, 'wss://optimism-mainnet.blastapi.io/', OP_PUBLIC, 'wss://optimism.publicnode.com/']) {
  return {
    name: 'OP Mainnet',
    chainId: '10',
    ecosystem: 'ethereum',
    currentProvider: BLAST,
    customNodes: [],
    nodes: nodes.map((url) => ({ name: url, url })),
    assets: [
      { id: 'eth', symbol: 'ETH', precision: 18, isUtility: true },
      { id: OP_TOKEN, symbol: 'OP', precision: 18 },
    ],
  } as unknown as NetworkJson;
}

const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;

/**
 * Real providers and failover with only the HTTP transport replaced: Blast refuses every call with the 403 it sends
 * since the service closed, and the public node answers 1 ETH and 2 OP.
 */
function answerAsNodesDo(asked: string[]) {
  return vi.spyOn(JsonRpcProvider.prototype, '_send').mockImplementation(async function (
    this: JsonRpcProvider,
    payload: JsonRpcPayload | JsonRpcPayload[]
  ) {
    const url = this._getConnection().url;
    const requests = Array.isArray(payload) ? payload : [payload];
    asked.push(...requests.map(({ method }) => `${url} ${method}`));
    if (url === BLAST) throw makeError('server response 403 Forbidden', 'SERVER_ERROR', { request: undefined as never });
    const results: Record<string, string> = {
      eth_chainId: '0xa',
      eth_getBalance: word(10n ** 18n),
      eth_call: word(2n * 10n ** 18n),
    };
    return requests.map(({ id, method }) => ({ id, result: results[method] }) as JsonRpcResult);
  });
}

function backgroundWith(network: NetworkJson) {
  const handler = new EvmApiHandler({ [network.name]: network });
  const setBalanceItem = vi.fn();
  const state = {
    currentAccount: { ethereumAddress: ADDRESS },
    isReady: () => true,
    getEvmApi: (name: string) => handler.getApi(name),
    keyringService: { getSubstrateAddress: () => SUBSTRATE },
    networkService: { networkValues: [network], networkMap: { [network.name]: network }, evmApiHandler: handler },
    evmContractService: new EvmContractService(),
    balanceService: {
      balanceMap: {},
      setBalanceItem,
      refreshNetworkBalances: (_chain: string, _address: string, refresh: () => Promise<unknown>) => refresh(),
    },
  } as unknown as State;
  handler.initEvmApi(network);

  return { handler, service: new EvmBalanceService(state), setBalanceItem };
}

const states = (setBalanceItem: ReturnType<typeof vi.fn>) =>
  Object.fromEntries(setBalanceItem.mock.calls.map(([, item]) => [item.symbol, [item.state, item.total]]));

describe('EVM balances when a node stops answering', () => {
  let asked: string[];

  beforeEach(() => {
    asked = [];
    answerAsNodesDo(asked);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('move OP Mainnet off Blast once and read every balance on the next node, instead of failing them all', async () => {
    const { handler, service, setBalanceItem } = backgroundWith(opMainnet());

    await service.fetchBalance({ networks: ['OP Mainnet'], ethereumAddress: ADDRESS, force: true });

    expect(states(setBalanceItem)).toEqual({ ETH: [APIItemState.READY, '1.0'], OP: [APIItemState.READY, '2.0'] });
    expect(asked.some((line) => line.startsWith(BLAST))).toBe(true);
    expect((handler.api['op mainnet'].api as JsonRpcProvider)._getConnection().url).toBe(OP_PUBLIC);
    // Both reads failed on Blast together, and the network moved on once: the next refresh asks the public node only.
    asked.length = 0;
    await service.fetchBalance({ networks: ['OP Mainnet'], ethereumAddress: ADDRESS, force: true });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((line) => line.startsWith(OP_PUBLIC))).toBe(true);
    handler.destroyApi('OP Mainnet');
  });

  it('never ask Blast once the registry drops it, though the profile still has it saved as the current node', async () => {
    const { handler, service, setBalanceItem } = backgroundWith(opMainnet([OP_PUBLIC, 'wss://optimism.publicnode.com/']));

    await service.fetchBalance({ networks: ['OP Mainnet'], ethereumAddress: ADDRESS, force: true });

    expect(states(setBalanceItem)).toEqual({ ETH: [APIItemState.READY, '1.0'], OP: [APIItemState.READY, '2.0'] });
    expect(asked.every((line) => line.startsWith(OP_PUBLIC))).toBe(true);
    handler.destroyApi('OP Mainnet');
  });

  it('stay failed, with no amount, when every node refuses', async () => {
    const { handler, service, setBalanceItem } = backgroundWith(opMainnet([BLAST]));

    await service.fetchBalance({ networks: ['OP Mainnet'], ethereumAddress: ADDRESS, force: true });

    expect(states(setBalanceItem)).toEqual({ ETH: [APIItemState.ERROR, undefined], OP: [APIItemState.ERROR, undefined] });
    handler.destroyApi('OP Mainnet');
  });

  it('count a reverted or undecodable call as the chain answering, and anything else as the node failing', () => {
    expect(isEvmNodeFailure(makeError('server response 403 Forbidden', 'SERVER_ERROR', { request: undefined as never }))).toBe(true);
    expect(isEvmNodeFailure(makeError('request timeout', 'TIMEOUT', { operation: 'getBalance', reason: 'timeout' }))).toBe(true);
    expect(isEvmNodeFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isEvmNodeFailure(makeError('execution reverted', 'CALL_EXCEPTION', {} as never))).toBe(false);
    expect(isEvmNodeFailure(makeError('could not decode result data', 'BAD_DATA', { value: '0x' }))).toBe(false);
  });
});
