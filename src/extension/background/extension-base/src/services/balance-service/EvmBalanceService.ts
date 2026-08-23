import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { ethers } from 'ethers';
import { REFRESH_TIME } from '../evm-contract-service';
import type State from '@extension-base/background/handlers/State';
import type { ResponseBalanceRequest, FetchBalancePayload } from '@extension-base/background/types/types';

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

        if (assetId) {
          const balance = await this.fetchEvmAssetBalance(ethereumAddress, name, assetId, this.state);

          return [{ balance, network: name, assetId }];
        }

        const assetsPromises = assets.map(async ({ id }) => {
          const balance = await this.fetchEvmAssetBalance(ethereumAddress, name, id, this.state);

          return {
            balance,
            assetId: id,
            network: name,
          };
        });

        return await Promise.all(assetsPromises);
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

    const apiProps = state.getEvmApi(networkKey);
    const api = apiProps?.api;

    if (!api) throw new Error('API not found');

    try {
      const balance = await api.getBalance(ethereumAddress);
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
      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.ERROR,
          symbol,
          id,
          relayChain: 'ethereum',
          free: '0',
          reserved: '0',
          frozen: '0',
          transferable: '0',
          total: '0',
        },
        address
      );

      this.state.networkService.evmApiHandler.refreshEvmApi(networkKey);

      return cachedBalance ?? '0';
    }
  }

  async fetchTokenBalance(ethereumAddress: string, networkKey: string, contractAddress: string, state: State) {
    const network = state.networkService.networkMap[networkKey];
    const asset = network.assets.find((el) => el.id === contractAddress);
    const api = state.getEvmApi(networkKey);

    const address = state.keyringService.getSubstrateAddress(ethereumAddress);

    if (!asset || !api.api) return '0';

    const { symbol, precision, id } = asset;

    try {
      const contract = await this.state.evmContractService.getContract(contractAddress, api.api);
      const balanceOf = await contract.balanceOf(ethereumAddress);

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
      state.balanceService.setBalanceItem(
        networkKey,
        {
          state: APIItemState.ERROR,
          symbol,
          id,
          relayChain: 'ethereum',
          free: '0',
          reserved: '0',
          frozen: '0',
          transferable: '0',
          total: '0',
        },
        address
      );

      return cachedBalance ?? '0';
    }
  }

  private getCachedBalance(address: string, network: string, assetId: string): string | undefined {
    const balance = (this.state.balanceService.balanceMap[address] ?? [])
      .flatMap(({ balances }) => balances)
      .find(({ id, name }) => id === assetId && name.toLowerCase() === network.toLowerCase());

    return balance?.transferable ?? balance?.total ?? balance?.free;
  }
}
