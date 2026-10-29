import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { ethers, isError } from 'ethers';
import { REFRESH_TIME } from '../evm-contract-service';
import type State from '@extension-base/background/handlers/State';
import type { ResponseBalanceRequest, FetchBalancePayload, EvmProvider } from '@extension-base/background/types/types';
import { withTimeout } from '@/util/endpointFailover';

/** A balance read the node has not answered by then counts as an outage, so the network moves on to its next node. */
export const EVM_BALANCE_TIMEOUT_MS = 15_000;

class EvmBalanceTimeoutError extends Error {
  constructor() {
    super('evm_balance_timeout');
  }
}

/**
 * Whether a failed read says the node is unusable (refused, an HTTP error, no answer in time, another chain, a provider
 * replaced mid-request) rather than answering for the chain. A reverted or undecodable call is the chain's answer about
 * that contract, and every other node would give it too.
 */
export function isEvmNodeFailure(error: unknown): boolean {
  return !(isError(error, 'CALL_EXCEPTION') || isError(error, 'BAD_DATA') || isError(error, 'INVALID_ARGUMENT'));
}

export default class EvmBalanceService {
  constructor(private readonly state: State) {}

  async fetchBalance({
    networks,
    ethereumAddress: ethAddress,
    assetId,
    force,
  }: FetchBalancePayload): Promise<ResponseBalanceRequest[]> {
    if (!this.state.isReady()) return [];

    const ethereumAddress = ethAddress ?? this.state.currentAccount?.ethereumAddress ?? '';

    if (ethereumAddress === '') return [];

    const requested = new Set((networks ?? []).map((name) => name.toLowerCase()));
    const filteredNetworks = this.state.networkService.networkValues.filter(
      ({ ecosystem, name }) => ecosystem === 'ethereum' && requested.has(name.toLowerCase())
    );

    const promises: Promise<ResponseBalanceRequest[]>[] = filteredNetworks.map(
      async ({ assets, name, networkStatus }) => {
        const api = this.state.getEvmApi(name);

        if (!api) return [];

        const timeout = api.timeout[ethereumAddress] ?? Number.MIN_VALUE;
        const timeDiff = Date.now() - timeout;
        const shouldSkipUpdate = timeDiff < REFRESH_TIME && !force;

        if (shouldSkipUpdate || networkStatus === NETWORK_STATUS.DISCONNECTED) return [];

        // Save timeout [network api][ethereum address]
        api.timeout[ethereumAddress] = Date.now();

        const requestedAssets = assetId ? [{ id: assetId }] : assets;
        if (!requestedAssets.length) return [];
        const address = this.state.keyringService.getSubstrateAddress(ethereumAddress);

        return this.state.balanceService.refreshNetworkBalances(name, address, async () => {
          const assetsPromises = requestedAssets.map(async ({ id }) => {
            const balance = await this.fetchEvmAssetBalance(ethereumAddress, name, id, this.state);

            return { balance, assetId: id, network: name };
          });

          // Wait for every result even if one request throws before its balance error handler.
          const results = await Promise.allSettled(assetsPromises);
          return results.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          });
        }, !assetId);
      }
    );

    return (await Promise.all(promises)).flat();
  }

  async fetchEvmAssetBalance(ethereumAddress: string, networkKey: string, assetId: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const asset = network.assets.find((asset) => asset.id === assetId);

    if (!asset) throw new Error(`Asset ${assetId} is missing on ${networkKey}`);

    if (asset.isUtility) {
      const balance = await this.fetchUtilityBalance(networkKey, ethereumAddress, state);

      return balance;
    }

    const balance = await this.fetchTokenBalance(ethereumAddress, networkKey, asset.id, state);

    return balance;
  }

  async fetchUtilityBalance(networkKey: string, ethereumAddress: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const { id, symbol } = network.assets.find((el) => el.isUtility)!;

    const address = state.keyringService.getSubstrateAddress(ethereumAddress);

    if (!state.getEvmApi(networkKey)?.api) throw new Error('API not found');

    try {
      const balance = await this.readOnNode(networkKey, (api) => api.getBalance(ethereumAddress));
      const utilityBalance = ethers.formatEther(balance);

      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.READY,
          symbol,
          id,
          relayChain: 'ethereum',
          free: utilityBalance,
          reserved: '0',
          frozen: '0',
          transferable: utilityBalance,
          total: utilityBalance,
        },
        address
      );

      return utilityBalance;
    } catch {
      const cachedBalance = this.getCachedBalance(address, networkKey, id);
      // No amount: setBalanceItem keeps the last confirmed one, and a balance that never loaded stays unknown
      // instead of a confirmed 0 (the first start after the update from 3.0.5 has no balance cache).
      state.balanceService.setBalanceItem(networkKey, { state: APIItemState.ERROR, symbol, id, relayChain: 'ethereum' }, address);

      return cachedBalance ?? '0';
    }
  }

  async fetchTokenBalance(ethereumAddress: string, networkKey: string, contractAddress: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const asset = network.assets.find((el) => el.id === contractAddress);
    const api = state.getEvmApi(networkKey);

    const address = state.keyringService.getSubstrateAddress(ethereumAddress);

    if (!asset) throw new Error(`Asset ${contractAddress} is missing on ${networkKey}`);
    if (!api?.api) throw new Error('API not found');

    const { symbol, precision, id } = asset;

    try {
      const balanceOf = await this.readOnNode(networkKey, async (provider) => {
        const contract = await this.state.evmContractService.getContract(contractAddress, provider);

        return contract.balanceOf(ethereumAddress);
      });

      const balance = ethers.formatUnits(balanceOf, precision);

      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.READY,
          symbol,
          id,
          relayChain: 'ethereum',
          free: balance,
          reserved: '0',
          frozen: '0',
          transferable: balance,
          total: balance,
        },
        address
      );

      return balance;
    } catch {
      const cachedBalance = this.getCachedBalance(address, networkKey, id);
      // No amount: setBalanceItem keeps the last confirmed one, and a balance that never loaded stays unknown
      // instead of a confirmed 0 (the first start after the update from 3.0.5 has no balance cache).
      state.balanceService.setBalanceItem(networkKey, { state: APIItemState.ERROR, symbol, id, relayChain: 'ethereum' }, address);

      return cachedBalance ?? '0';
    }
  }

  /**
   * Reads on the network's node within EVM_BALANCE_TIMEOUT_MS. When the node fails, the network moves on to its next
   * node and the read is tried there once, so a dead node costs a moment instead of the balance.
   */
  private async readOnNode<T>(networkKey: string, read: (api: EvmProvider) => Promise<T>): Promise<T> {
    const handler = this.state.networkService.evmApiHandler;
    let api = this.state.getEvmApi(networkKey)?.api;

    for (let attempt = 0; ; attempt += 1) {
      if (!api) throw new Error('API not found');

      try {
        return await withTimeout(read(api), EVM_BALANCE_TIMEOUT_MS, () => new EvmBalanceTimeoutError());
      } catch (error) {
        if (!isEvmNodeFailure(error)) throw error;

        const next = handler.failover(networkKey, api)?.api;

        if (attempt > 0 || !next) throw error;

        api = next;
      }
    }
  }

  private getCachedBalance(address: string, network: string, assetId: string): string | undefined {
    const balance = (this.state.balanceService.balanceMap[address] ?? [])
      .flatMap(({ balances }) => balances)
      .find(({ id, name }) => id === assetId && name.toLowerCase() === network.toLowerCase());

    return balance?.transferable ?? balance?.total ?? balance?.free;
  }
}
