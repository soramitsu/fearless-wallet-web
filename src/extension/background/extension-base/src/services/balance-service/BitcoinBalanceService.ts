import { APIItemState } from '@extension-base/api/types/networks';
import { BitcoinEsploraClient, type BitcoinAddressBalance } from '@extension-base/services/bitcoin-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { FetchBalancePayload, ResponseBalanceRequest, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';
import { getBitcoinAddressNetwork, type BitcoinNetworkKind } from '@/util/bitcoin';

type BitcoinBalanceClient = Pick<BitcoinEsploraClient, 'getBalance'>;
type BitcoinBalanceClientFactory = (network: NetworkJson, bitcoinNetwork: BitcoinNetworkKind) => BitcoinBalanceClient;

const BITCOIN_FALLBACK_NETWORK = 'Bitcoin';
const BITCOIN_FALLBACK_ASSET_ID = 'BTC';
const BITCOIN_FALLBACK_ICON = 'bitcoin';
const BITCOIN_FALLBACK_PRECISION = 8;

export default class BitcoinBalanceService {
  constructor(
    private readonly state: State,
    private readonly clientFactory: BitcoinBalanceClientFactory = (_network, bitcoinNetwork) =>
      new BitcoinEsploraClient({ network: bitcoinNetwork })
  ) {}

  async fetchBalance({
    address,
    bitcoinAddress,
    bitcoinTestnetAddress,
    networks = [],
  }: FetchBalancePayload & { bitcoinAddress?: string; bitcoinTestnetAddress?: string }): Promise<ResponseBalanceRequest[]> {
    const accountAddress = address ?? bitcoinAddress ?? bitcoinTestnetAddress;

    if (!accountAddress) return [];

    const bitcoinNetworks = this.getBitcoinNetworks(networks);

    if (!bitcoinNetworks.length) return [];

    const results = await Promise.all(
      bitcoinNetworks.map((network) =>
        this.fetchNetworkBalance(accountAddress, { bitcoinAddress, bitcoinTestnetAddress }, network)
      )
    );

    return results;
  }

  private async fetchNetworkBalance(
    accountAddress: string,
    walletAddresses: { bitcoinAddress?: string; bitcoinTestnetAddress?: string },
    network: NetworkJson
  ): Promise<ResponseBalanceRequest> {
    const bitcoinNetwork = this.getBitcoinNetworkKind(network);
    const wallet = this.getWalletAddress(walletAddresses, bitcoinNetwork);
    const addressNetwork = wallet ? getBitcoinAddressNetwork(wallet) : null;
    const asset = this.getNativeAsset(network);

    if (!wallet || addressNetwork !== bitcoinNetwork) {
      this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR);

      return { assetId: asset.id, balance: '0', network: network.name };
    }

    try {
      const balance = await this.clientFactory(network, bitcoinNetwork).getBalance(wallet);
      const balanceString = this.satsToBitcoinString(balance.totalSats);

      this.setNativeBalance(accountAddress, network, balance, APIItemState.READY);

      return { assetId: asset.id, balance: balanceString, network: network.name };
    } catch (error) {
      const cachedBalances = this.markCachedBalancesErrored(accountAddress, network);

      if (cachedBalances.length) {
        console.warn('Failed to fetch Bitcoin balance, keeping cached balances', error);

        return cachedBalances[0];
      }

      this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR);

      console.warn('Failed to fetch Bitcoin balance', error);

      return { assetId: asset.id, balance: '0', network: network.name };
    }
  }

  private getBitcoinNetworks(networks: string[]): NetworkJson[] {
    const activeBitcoinNetworks = this.state.networkService.activeNetworkByEcosystem.bitcoin ?? [];

    if (networks.length) {
      const selected = activeBitcoinNetworks.filter((network) =>
        networks.some((requestedNetwork) => this.matchesNetwork(network, requestedNetwork))
      );

      if (selected.length) return selected;

      return networks
        .map((network) => this.resolveNetwork(network))
        .filter((network): network is NetworkJson => network?.ecosystem === 'bitcoin');
    }

    if (activeBitcoinNetworks.length) return activeBitcoinNetworks;

    const fallback = this.state.networkService.networkMap[BITCOIN_FALLBACK_NETWORK];

    if (fallback?.ecosystem === 'bitcoin') return [fallback];

    const firstBitcoinNetwork = Object.values(this.state.networkService.networkMap).find(
      ({ ecosystem }) => ecosystem === 'bitcoin'
    );

    return firstBitcoinNetwork ? [firstBitcoinNetwork] : [];
  }

  private resolveNetwork(networkNameOrChainId: string): NetworkJson | undefined {
    return (
      this.state.networkService.networkMap[networkNameOrChainId] ??
      Object.values(this.state.networkService.networkMap).find((network) =>
        this.matchesNetwork(network, networkNameOrChainId)
      )
    );
  }

  private matchesNetwork(network: NetworkJson, requestedNetwork: string): boolean {
    return [network.name, network.key, network.chainId].some((value) => value && isSameString(value, requestedNetwork));
  }

  private getBitcoinNetworkKind(network: NetworkJson): BitcoinNetworkKind {
    const descriptor = [network.name, network.key, network.chainId, ...(network.options ?? [])].join(' ').toLowerCase();

    return descriptor.includes('testnet') || descriptor.includes('test net') || descriptor.includes('bitcoin:testnet')
      ? 'testnet'
      : 'mainnet';
  }

  private getWalletAddress(
    { bitcoinAddress, bitcoinTestnetAddress }: { bitcoinAddress?: string; bitcoinTestnetAddress?: string },
    bitcoinNetwork: BitcoinNetworkKind
  ): string | undefined {
    const preferredAddress = bitcoinNetwork === 'testnet' ? bitcoinTestnetAddress : bitcoinAddress;

    if (preferredAddress) return preferredAddress;

    const fallbackAddress = bitcoinNetwork === 'testnet' ? bitcoinAddress : bitcoinTestnetAddress;

    return fallbackAddress && getBitcoinAddressNetwork(fallbackAddress) === bitcoinNetwork ? fallbackAddress : undefined;
  }

  private getNativeAsset(network: NetworkJson): { id: string; icon: string; precision: number; symbol: string } {
    const asset = network.assets.find(({ isUtility, isNative, symbol }) => isUtility || isNative || symbol === 'BTC');

    return {
      id: asset?.id ?? BITCOIN_FALLBACK_ASSET_ID,
      icon: asset?.icon ?? BITCOIN_FALLBACK_ICON,
      precision: asset?.precision ?? BITCOIN_FALLBACK_PRECISION,
      symbol: asset?.symbol ?? 'BTC',
    };
  }

  private setNativeBalance(
    address: string,
    network: NetworkJson,
    balance: BitcoinAddressBalance | undefined,
    state: APIItemState
  ): void {
    const { id, icon, precision, symbol } = this.getNativeAsset(network);
    const balanceString = balance ? this.satsToBitcoinString(balance.totalSats) : '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol);
    const balanceItem: BalanceItem = {
      address,
      icon: network.icon || icon,
      id,
      isNative: true,
      isUtility: true,
      mainNetwork: network.name,
      name: network.name,
      precision,
      relayChain: 'bitcoin',
      reserved: '0',
      frozen: '0',
      locked: '0',
      free: balanceString,
      total: balanceString,
      transferable: balanceString,
      state,
      symbol,
      type: 'bitcoin',
      timestamp: Date.now(),
    };
    const existingIndex = tokenGroup.balances.findIndex(({ name }) => isSameString(name, network.name));

    if (existingIndex === -1) tokenGroup.balances.push(balanceItem);
    else tokenGroup.balances[existingIndex] = { ...tokenGroup.balances[existingIndex], ...balanceItem };

    this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
    this.state.timeoutService.lazyNext('setBitcoinBalanceItem', () => this.state.balanceService.publishBalance(), 500);
  }

  private markCachedBalancesErrored(address: string, network: NetworkJson): ResponseBalanceRequest[] {
    const groups = this.state.balanceService.balanceMap[address] ?? [];
    const balances: ResponseBalanceRequest[] = [];

    groups
      .filter(({ relayChain }) => isSameString(relayChain, 'bitcoin'))
      .forEach((group) => {
        const balanceIndex = group.balances.findIndex(({ name }) => isSameString(name, network.name));

        if (balanceIndex < 0) return;

        const existing = group.balances[balanceIndex];
        const balanceItem = {
          ...existing,
          state: APIItemState.ERROR,
          timestamp: Date.now(),
        };

        group.balances[balanceIndex] = balanceItem;
        balances.push({ assetId: balanceItem.id, balance: balanceItem.total, network: network.name });
        this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
      });

    if (balances.length) {
      this.state.timeoutService.lazyNext('setBitcoinBalanceItem', () => this.state.balanceService.publishBalance(), 500);
    }

    return balances;
  }

  private getOrCreateTokenGroup(
    address: string,
    network: NetworkJson,
    assetId: string,
    assetIcon: string,
    symbol: string
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && isSameString(relayChain, 'bitcoin')
    );

    if (existing) {
      existing.mainNetwork = network.name;
      existing.relayChain = 'bitcoin';

      return existing;
    }

    const tokenGroup: TokenGroup = {
      balances: [],
      groupId: assetId,
      icon: assetIcon,
      mainNetwork: network.name,
      priceId: symbol,
      providers: [],
      relayChain: 'bitcoin',
      symbol,
      tokenName: symbol,
    };

    this.state.balanceService.balanceMap[address].push(tokenGroup);

    return tokenGroup;
  }

  private satsToBitcoinString(sats: number): string {
    if (!Number.isSafeInteger(sats) || sats < 0) throw new Error('invalid_bitcoin_balance');

    const whole = Math.floor(sats / 100_000_000).toString();
    const fractional = (sats % 100_000_000).toString().padStart(8, '0').replace(/0+$/u, '');

    return fractional ? `${whole}.${fractional}` : whole;
  }
}

export type { BitcoinBalanceClient, BitcoinBalanceClientFactory };
