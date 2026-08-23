import { APIItemState } from '@extension-base/api/types/networks';
import { BitcoinEsploraClient, type BitcoinAddressBalance } from '@extension-base/services/bitcoin-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { FetchBalancePayload, ResponseBalanceRequest, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';
import { getBitcoinAddressNetwork, isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';
import {
  aggregateBitcoinAddressBalances,
  aggregateBitcoinDiscoveryBalance,
  discoverBitcoinWalletAddresses,
  type BitcoinDiscoveredAddress,
  type BitcoinDiscoveryClient,
  type BitcoinWalletDiscoveryResult,
} from '@/util/bitcoinDiscovery';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';

type BitcoinBalanceClient = Pick<BitcoinEsploraClient, 'getBalance'> & Partial<BitcoinDiscoveryClient>;
type BitcoinBalanceClientFactory = (network: NetworkJson, bitcoinNetwork: BitcoinNetworkKind) => BitcoinBalanceClient;
type BitcoinBalanceDiscoveryOptions = {
  gapLimit?: number;
  maxLookahead?: number;
};
type BitcoinBalanceItem = BalanceItem & {
  bitcoinAddresses?: Array<Pick<BitcoinDiscoveredAddress, 'address' | 'change' | 'index' | 'path'>>;
  bitcoinNextChangeAddress?: string;
  bitcoinNextChangePath?: string;
  bitcoinNextReceiveAddress?: string;
  bitcoinNextReceivePath?: string;
};

const BITCOIN_FALLBACK_NETWORK = 'Bitcoin';
const BITCOIN_FALLBACK_ASSET_ID = 'BTC';
const BITCOIN_BALANCE_ADDRESS_CONCURRENCY = 8;
const BITCOIN_FALLBACK_ICON = 'bitcoin';
const BITCOIN_FALLBACK_PRECISION = 8;

export default class BitcoinBalanceService {
  constructor(
    private readonly state: State,
    private readonly clientFactory: BitcoinBalanceClientFactory = (_network, bitcoinNetwork) =>
      new BitcoinEsploraClient({ network: bitcoinNetwork }),
    private readonly discoveryOptions: BitcoinBalanceDiscoveryOptions = {}
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
      await this.deleteStoredBitcoinBalance(accountAddress, network, asset.id);
      this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR, undefined, false);

      return { assetId: asset.id, balance: '0', network: network.name };
    }

    let client: BitcoinBalanceClient | undefined;

    try {
      client = this.clientFactory(network, bitcoinNetwork);
      const mnemonicOrSeed = this.resolveMnemonic(accountAddress, wallet, bitcoinNetwork);
      const storedAddresses = mnemonicOrSeed
        ? []
        : this.getStoredBitcoinAddresses(accountAddress, wallet, network, bitcoinNetwork);
      const discovery = mnemonicOrSeed && typeof client.getAddress === 'function'
        ? await discoverBitcoinWalletAddresses({
            client: client as BitcoinDiscoveryClient,
            gapLimit: this.discoveryOptions.gapLimit,
            maxLookahead: this.discoveryOptions.maxLookahead,
            mnemonicOrSeed,
            network: bitcoinNetwork,
          })
        : undefined;
      const balance = discovery
        ? aggregateBitcoinDiscoveryBalance(discovery.addresses)
        : storedAddresses.length
          ? aggregateBitcoinAddressBalances(await this.fetchStoredAddressBalances(client, storedAddresses))
          : await client.getBalance(wallet);
      const balanceString = this.satsToBitcoinString(balance.totalSats);

      this.setNativeBalance(
        accountAddress,
        network,
        balance,
        APIItemState.READY,
        discovery,
        Boolean(discovery || storedAddresses.length)
      );

      return { assetId: asset.id, balance: balanceString, network: network.name };
    } catch (error) {
      if (error instanceof Error && error.message === 'bitcoin_account_seed_mismatch') {
        this.clearCachedBitcoinDiscovery(accountAddress, network);

        try {
          if (!client) throw new Error('bitcoin_balance_client_unavailable', { cause: error });
          const fallbackBalance = await client.getBalance(wallet);
          const fallbackBalanceString = this.satsToBitcoinString(fallbackBalance.totalSats);

          const cleanBalanceItem = this.setNativeBalance(
            accountAddress,
            network,
            fallbackBalance,
            APIItemState.READY,
            undefined,
            false,
            false
          );
          await this.state.balanceService.updateBalanceStore(network.name, cleanBalanceItem, accountAddress);

          return { assetId: asset.id, balance: fallbackBalanceString, network: network.name };
        } catch (fallbackError) {
          console.warn('Bitcoin seed mismatch; unable to refresh the first receive address', fallbackError);
          await this.deleteStoredBitcoinBalance(accountAddress, network, asset.id);
          this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR, undefined, false);

          return { assetId: asset.id, balance: '0', network: network.name };
        }
      }
      const cachedBalances = this.markCachedBalancesErrored(accountAddress, network);

      if (cachedBalances.length) {
        console.warn('Failed to fetch Bitcoin balance, keeping cached balances', error);

        return cachedBalances[0];
      }

      this.setNativeBalance(
        accountAddress,
        network,
        undefined,
        APIItemState.ERROR,
        undefined,
        !(error instanceof Error && error.message === 'bitcoin_account_seed_mismatch')
      );

      console.warn('Failed to fetch Bitcoin balance', error);

      return { assetId: asset.id, balance: '0', network: network.name };
    }
  }

  private resolveMnemonic(accountAddress: string, walletAddress: string, network: BitcoinNetworkKind): string | null {
    const account = this.state.keyringService?.getAllAccounts?.().find(({ address, meta }) => {
      const bitcoinAddress = meta.bitcoinAddress as string | undefined;
      const bitcoinTestnetAddress = meta.bitcoinTestnetAddress as string | undefined;

      return (
        isSameString(address, accountAddress) ||
        isSameString(bitcoinAddress ?? '', walletAddress) ||
        isSameString(bitcoinTestnetAddress ?? '', walletAddress)
      );
    });

    if (!account) return null;

    const { seed } = this.state.keyringService.exportMnemonic({
      address: account.address,
      walletEcosystem: account.meta.walletEcosystem,
    });

    if (!seed) return null;

    const firstReceiveAddress = deriveBitcoinReceiveAddress({ mnemonicOrSeed: seed, network });

    if (!isSameString(firstReceiveAddress, walletAddress)) throw new Error('bitcoin_account_seed_mismatch');

    return seed;
  }

  private getStoredBitcoinAddresses(
    accountAddress: string,
    walletAddress: string,
    network: NetworkJson,
    bitcoinNetwork: BitcoinNetworkKind
  ): string[] {
    const balance = this.state.balanceService.balanceMap[accountAddress]
      ?.flatMap(({ balances }) => balances)
      .find(({ name }) => isSameString(name, network.name)) as BitcoinBalanceItem | undefined;
    const descriptors = balance?.bitcoinAddresses ?? [];
    const firstReceivePath = getBitcoinReceivePath(bitcoinNetwork, 0);
    const firstReceive = descriptors.find(({ change, index, path }) =>
      change === 0 && index === 0 && path === firstReceivePath
    );

    if (!firstReceive || !isSameString(firstReceive.address, walletAddress)) return [];

    const addresses = descriptors
      .map(({ address }) => address)
      .filter((address) => isBitcoinAddress(address, bitcoinNetwork));

    return Array.from(new Set(addresses.map((address) => address.toLowerCase())));
  }

  private async fetchStoredAddressBalances(
    client: BitcoinBalanceClient,
    addresses: readonly string[]
  ): Promise<BitcoinAddressBalance[]> {
    const balances: BitcoinAddressBalance[] = [];

    for (let offset = 0; offset < addresses.length; offset += BITCOIN_BALANCE_ADDRESS_CONCURRENCY) {
      const batch = addresses.slice(offset, offset + BITCOIN_BALANCE_ADDRESS_CONCURRENCY);

      balances.push(...await Promise.all(batch.map((address) => client.getBalance(address))));
    }

    return balances;
  }

  private async deleteStoredBitcoinBalance(
    accountAddress: string,
    network: NetworkJson,
    assetId: string
  ): Promise<void> {
    await Promise.resolve(
      this.state.balanceService.deleteBalanceStore(network.name, { id: assetId }, accountAddress)
    ).catch((error) => console.warn('Unable to delete stale Bitcoin balance storage', error));
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

  private getNativeAsset(
    network: NetworkJson
  ): { id: string; icon: string; precision: number; symbol: string; priceId?: string } {
    const asset = network.assets.find(({ isUtility, isNative, symbol }) => isUtility || isNative || symbol === 'BTC');

    return {
      id: asset?.id ?? BITCOIN_FALLBACK_ASSET_ID,
      icon: asset?.icon ?? BITCOIN_FALLBACK_ICON,
      precision: asset?.precision ?? BITCOIN_FALLBACK_PRECISION,
      symbol: asset?.symbol ?? 'BTC',
      priceId: asset?.priceId,
    };
  }

  private setNativeBalance(
    address: string,
    network: NetworkJson,
    balance: BitcoinAddressBalance | undefined,
    state: APIItemState,
    discovery?: BitcoinWalletDiscoveryResult,
    preserveExistingDiscovery = true,
    persist = true
  ): BitcoinBalanceItem {
    const { id, icon, precision, symbol, priceId } = this.getNativeAsset(network);
    const balanceString = balance ? this.satsToBitcoinString(balance.totalSats) : '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol, priceId);
    const existingIndex = tokenGroup.balances.findIndex(({ name }) => isSameString(name, network.name));
    const existing = existingIndex >= 0 ? tokenGroup.balances[existingIndex] as BitcoinBalanceItem : undefined;
    const existingDiscovery = !discovery && preserveExistingDiscovery && existing
      ? {
          bitcoinAddresses: existing.bitcoinAddresses,
          bitcoinNextChangeAddress: existing.bitcoinNextChangeAddress,
          bitcoinNextChangePath: existing.bitcoinNextChangePath,
          bitcoinNextReceiveAddress: existing.bitcoinNextReceiveAddress,
          bitcoinNextReceivePath: existing.bitcoinNextReceivePath,
        }
      : {};
    const balanceItem: BitcoinBalanceItem = {
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
      assetMetadataTrust: 'verified',
      assetMetadataSource: 'registry',
      priceId,
      scanCoverage: discovery?.addresses.length || existingDiscovery.bitcoinAddresses?.length ? 'complete' : 'limited',
      ...existingDiscovery,
      ...(discovery
        ? {
            bitcoinAddresses: discovery.addresses.map(({ address, change, index, path }) => ({
              address,
              change,
              index,
              path,
            })),
            bitcoinNextChangeAddress: discovery.nextChangeAddress,
            bitcoinNextChangePath: discovery.nextChangePath,
            bitcoinNextReceiveAddress: discovery.nextReceiveAddress,
            bitcoinNextReceivePath: discovery.nextReceivePath,
          }
        : {}),
    };

    let storedBalanceItem = balanceItem;

    if (existingIndex === -1) tokenGroup.balances.push(balanceItem);
    else {
      storedBalanceItem = { ...tokenGroup.balances[existingIndex], ...balanceItem };
      if (!discovery && !preserveExistingDiscovery) this.stripBitcoinDiscovery(storedBalanceItem);
      tokenGroup.balances[existingIndex] = storedBalanceItem;
    }

    if (persist) this.state.balanceService.updateBalanceStore(network.name, storedBalanceItem, address);
    this.state.timeoutService.lazyNext('setBitcoinBalanceItem', () => this.state.balanceService.publishBalance(), 500);

    return storedBalanceItem;
  }

  private clearCachedBitcoinDiscovery(address: string, network: NetworkJson): void {
    (this.state.balanceService.balanceMap[address] ?? [])
      .flatMap(({ balances }) => balances)
      .filter(({ name }) => isSameString(name, network.name))
      .forEach((balance) => this.stripBitcoinDiscovery(balance as BitcoinBalanceItem));
  }

  private stripBitcoinDiscovery(balance: BitcoinBalanceItem): void {
    delete balance.bitcoinAddresses;
    delete balance.bitcoinNextChangeAddress;
    delete balance.bitcoinNextChangePath;
    delete balance.bitcoinNextReceiveAddress;
    delete balance.bitcoinNextReceivePath;
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
          timestamp: existing.timestamp,
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
    symbol: string,
    priceId?: string
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && isSameString(relayChain, 'bitcoin')
    );

    if (existing) {
      existing.mainNetwork = network.name;
      existing.relayChain = 'bitcoin';
      if (priceId) existing.priceId = priceId;

      return existing;
    }

    const tokenGroup: TokenGroup = {
      balances: [],
      groupId: assetId,
      icon: assetIcon,
      mainNetwork: network.name,
      priceId,
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

export type { BitcoinBalanceClient, BitcoinBalanceClientFactory, BitcoinBalanceDiscoveryOptions, BitcoinBalanceItem };
