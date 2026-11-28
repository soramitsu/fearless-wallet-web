// @vitest-environment node
/**
 * Live check of ERC-20 discovery (docs/evm-token-discovery.md) against the registry's own nodes, with the token lists
 * of this checkout. It reads mainnet balances, so it runs only when asked:
 *
 *   FEARLESS_LIVE_EVM_TOKENS=1 NODE_OPTIONS=--no-experimental-webstorage vitest run tests/unit/evm-token-discovery-live.spec.ts
 *
 * The wallet is account 0 of the BIP-39 test phrase ("abandon" eleven times, then "about"): a public test wallet that
 * holds tokens outside the registry (KICK on Ethereum, BUSD.e on Avalanche C-Chain, 2026-11-13). Nothing is signed or
 * sent; only balances are read.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HDNodeWallet, Interface, JsonRpcProvider } from 'ethers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import EvmContractService, { REFRESH_TIME } from '@extension-base/services/evm-contract-service';
import { EvmTokenDiscoveryService } from '@extension-base/services/evm-token-discovery';
import { MULTICALL3_ADDRESS } from '@extension-base/services/evm-token-discovery/multicall';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { TimeoutService } from '@extension-base/services/timeout-service';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import type { JsonRpcPayload } from 'ethers';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@extension-base/stores/Storage', () => {
  const stored: Record<string, unknown> = {};

  return {
    storage: {
      get: async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, structuredClone(stored[key])])),
      set: async (value: Record<string, unknown>) => Object.assign(stored, structuredClone(value)),
    },
  };
});

// Test workers do not see the shell's process.env here; Vitest passes it through import.meta.env.
const LIVE = import.meta.env.FEARLESS_LIVE_EVM_TOKENS === '1';
const PHRASE = `${'abandon '.repeat(11)}about`;
const ROOT = path.resolve(__dirname, '../..');
const LISTS = path.join(ROOT, 'remote-config/production/tokens/evm/v1');
const multicall = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
]);

describe.skipIf(!LIVE)('ERC-20 discovery on the live networks', () => {
  const address = HDNodeWallet.fromPhrase(PHRASE).address;
  const chains = JSON.parse(readFileSync(path.join(ROOT, 'remote-config/production/chains/v13/chains.json'), 'utf8')) as NetworkJson[];
  const networks = chains
    .filter(({ name }) => name === 'Ethereum' || name === 'Avalanche C-Chain')
    .map((network) => ({ ...network, active: true, customNodes: [], currentProvider: network.nodes[0].url }));
  const handler = new EvmApiHandler(Object.fromEntries(networks.map((network) => [network.name, network])));
  /** Each aggregate3 sent: its node and how many calls it carried. */
  const multicalls: { host: string; calls: number }[] = [];
  let balanceService: BalanceService;

  beforeAll(() => {
    const send = JsonRpcProvider.prototype._send;

    vi.spyOn(JsonRpcProvider.prototype, '_send').mockImplementation(function (this: JsonRpcProvider, payload: JsonRpcPayload | JsonRpcPayload[]) {
      for (const request of Array.isArray(payload) ? payload : [payload]) {
        const [call] = (request.params ?? []) as [{ to?: string; data?: string }];

        if (request.method === 'eth_call' && call?.to?.toLowerCase() === MULTICALL3_ADDRESS.toLowerCase()) {
          const [calls] = multicall.decodeFunctionData('aggregate3', call.data!) as unknown as [unknown[]];

          multicalls.push({ host: new URL(this._getConnection().url).host, calls: calls.length });
        }
      }

      return send.call(this, payload);
    });

    const state = {
      isReady: () => true,
      currentAccount: { address, ethereumAddress: address, walletEcosystem: WalletEcosystem.Evm },
      getEvmApi: (name: string) => handler.getApi(name),
      keyringService: {
        getAllMainAccounts: () => [{ address, meta: { walletEcosystem: WalletEcosystem.Evm, ethereumAddress: address } }],
        getSubstrateAddress: (value: string) => value,
      },
      networkService: { networkValues: networks, networkMap: Object.fromEntries(networks.map((network) => [network.name, network])), evmApiHandler: handler },
      evmContractService: new EvmContractService(),
      evmTokenDiscoveryService: new EvmTokenDiscoveryService({
        fetchListFile: async (name) => {
          try {
            return JSON.parse(readFileSync(path.join(LISTS, name), 'utf8'));
          } catch {
            return undefined;
          }
        },
        readState: async () => undefined,
        writeState: async () => undefined,
      }),
    } as Record<string, unknown>;

    state.timeoutService = new TimeoutService(state as unknown as State);
    balanceService = new BalanceService(state as unknown as State);
    state.balanceService = balanceService;
    balanceService.generateDefaultBalance(address, WalletEcosystem.Evm);
    networks.forEach((network) => handler.initEvmApi(network));
  });

  afterAll(() => {
    handler.destroyAll();
    vi.restoreAllMocks();
  });

  const found = (): BalanceItem[] =>
    (balanceService.balanceMap[address] ?? [])
      .flatMap(({ balances }) => balances)
      .filter(({ assetMetadataSource }) => assetMetadataSource === 'tokenList');

  it('finds the test wallet’s tokens outside the registry, then reads only those again', async () => {
    expect(address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');

    await balanceService.evmBalanceService.fetchBalance({ networks: ['ethereum', 'avalanche c-chain'], ethereumAddress: address });

    const first = found();
    const report: Record<string, unknown> = {
      at: new Date().toISOString(),
      wallet: address,
      firstRead: {
        found: first.map(({ name, symbol, tokenName, id, total, assetMetadataTrust }) => ({ network: name, symbol, tokenName, contract: id, total, assetMetadataTrust })),
        aggregate3: [...multicalls],
      },
    };

    expect(first.find(({ symbol }) => symbol === 'KICK')).toMatchObject({
      name: 'Ethereum',
      assetMetadataTrust: 'unverified',
      assetMetadataSource: 'tokenList',
      state: APIItemState.READY,
    });
    expect(first.find(({ name }) => name === 'Avalanche C-Chain')).toBeDefined();
    expect(first.every(({ total }) => Number(total) > 0)).toBe(true);
    // The whole list of each network went out in chunks of at most 400 calls, to the registry's own nodes.
    expect(multicalls.every(({ calls }) => calls <= 400)).toBe(true);
    expect(new Set(multicalls.map(({ host }) => host))).toEqual(new Set(networks.map(({ nodes }) => new URL(nodes[0].url).host)));
    // The registry's own balances were read as before.
    const utilities = (balanceService.balanceMap[address] ?? []).flatMap(({ balances }) => balances).filter(({ isUtility }) => isUtility);
    expect(utilities.map(({ state }) => state)).toEqual([APIItemState.READY, APIItemState.READY]);

    multicalls.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + REFRESH_TIME + 1_000);
    try {
      await balanceService.evmBalanceService.fetchBalance({ networks: ['ethereum', 'avalanche c-chain'], ethereumAddress: address });
    } finally {
      vi.useRealTimers();
    }

    report.laterRead = { aggregate3: [...multicalls], found: found().map(({ symbol, total, state }) => ({ symbol, total, state })) };
    mkdirSync(path.join(ROOT, 'output/evm-token-discovery'), { recursive: true });
    writeFileSync(path.join(ROOT, 'output/evm-token-discovery/live-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const perNetwork = Object.fromEntries(
      networks.map(({ name, nodes }) => [name, multicalls.filter(({ host }) => host === new URL(nodes[0].url).host).map(({ calls }) => calls)])
    );
    expect(perNetwork).toEqual(
      Object.fromEntries(networks.map(({ name }) => [name, [first.filter((item) => item.name === name).length]]))
    );
    expect(found().map(({ id }) => id).sort()).toEqual(first.map(({ id }) => id).sort());
  }, 120_000);
});
