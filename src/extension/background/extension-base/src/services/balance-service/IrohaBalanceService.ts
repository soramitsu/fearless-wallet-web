import { APIItemState } from '@extension-base/api/types/networks';
import { createIrohaToriiWalletClient, type IrohaToriiRouteResponse } from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { FetchBalancePayload, ResponseBalanceRequest, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { RelayChainName } from '@/interfaces';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { isSameString } from '@/helpers';
import { parseIrohaI105Address } from '@/util/iroha';

type IrohaNetworkKey = keyof typeof UNIVERSAL_WALLET_IROHA_NETWORKS;

type IrohaAccountAssetListResponse = {
  items?: IrohaAccountAssetListItem[];
};

type IrohaAccountAssetListItem = {
  account_id?: string;
  accountId?: string;
  asset: string;
  asset_id?: string;
  assetId?: string;
  asset_name?: string;
  assetName?: string;
  asset_alias?: string;
  assetAlias?: string;
  quantity?: string;
  value?: string;
  scope?: string;
};

type IrohaAssetDefinitionListResponse = {
  items?: IrohaAssetDefinitionListItem[];
};

type IrohaAssetDefinitionListItem = {
  id: string;
  name?: string;
  alias?: string;
  metadata?: Record<string, unknown> | null;
};

type IrohaBalanceClient = {
  getAccountAssets<TBody = unknown>(
    accountId: string,
    options?: { limit?: number }
  ): Promise<IrohaToriiRouteResponse<TBody>>;
  getAssetDefinitions<TBody = unknown>(): Promise<TBody>;
};

type IrohaBalanceClientFactory = (network: NetworkJson, irohaNetwork: IrohaNetworkKey) => IrohaBalanceClient;

const IROHA_FALLBACK_NETWORK = 'Taira';
const IROHA_FALLBACK_ASSET_ID = 'xor#sora';
const IROHA_FALLBACK_ICON = 'iroha';
const IROHA_FALLBACK_SYMBOL = 'XOR';
const IROHA_MAX_BALANCE_ITEMS = 500;

export default class IrohaBalanceService {
  private readonly clientFactory: IrohaBalanceClientFactory;

  constructor(private readonly state: State, clientFactory?: IrohaBalanceClientFactory) {
    this.clientFactory =
      clientFactory ??
      ((network, irohaNetwork) =>
        createIrohaToriiWalletClient(irohaNetwork, { baseUrl: this.getRuntimeToriiBaseUrl(network) }));
  }

  async fetchBalance({
    address,
    irohaAddress,
    networks = [],
  }: FetchBalancePayload & { irohaAddress?: string }): Promise<ResponseBalanceRequest[]> {
    const accountAddress = address ?? irohaAddress;

    if (!accountAddress) return [];

    const irohaNetworks = this.getIrohaNetworks(networks);

    if (!irohaNetworks.length) return [];

    const results = await Promise.all(
      irohaNetworks.map((network) => this.fetchNetworkBalance(accountAddress, irohaAddress ?? address, network))
    );

    return results.flat();
  }

  private async fetchNetworkBalance(
    accountAddress: string,
    walletAddress: string | undefined,
    network: NetworkJson
  ): Promise<ResponseBalanceRequest[]> {
    const irohaNetwork = this.getIrohaNetworkKey(network);
    const nativeAsset = this.getNativeAsset(network);

    if (!walletAddress || !this.isAddressForNetwork(walletAddress, irohaNetwork)) {
      this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR);

      return [{ assetId: nativeAsset.id, balance: '0', network: network.name }];
    }

    try {
      const client = this.clientFactory(network, irohaNetwork);
      const [assetsResponse, definitionsResponse] = await Promise.all([
        client.getAccountAssets<IrohaAccountAssetListResponse>(walletAddress, { limit: IROHA_MAX_BALANCE_ITEMS }),
        this.fetchAssetDefinitions(client),
      ]);
      const definitions = this.getAssetDefinitionMap(definitionsResponse);
      const items = this.normalizeAssetItems(assetsResponse.body);

      if (!items.length) {
        this.setNativeBalance(accountAddress, network, undefined, APIItemState.READY);

        return [{ assetId: nativeAsset.id, balance: '0', network: network.name }];
      }

      items.forEach((item) => this.setAssetBalance(accountAddress, network, item, definitions.get(this.getAssetId(item))));

      return items.map((item) => ({
        assetId: this.getAssetId(item),
        balance: this.getQuantity(item),
        network: network.name,
      }));
    } catch (error) {
      const cachedBalances = this.markCachedBalancesErrored(accountAddress, network);

      if (cachedBalances.length) {
        console.warn('Failed to fetch Iroha balance, keeping cached balances', error);

        return cachedBalances;
      }

      this.setNativeBalance(accountAddress, network, undefined, APIItemState.ERROR);

      console.warn('Failed to fetch Iroha balance', error);

      return [{ assetId: nativeAsset.id, balance: '0', network: network.name }];
    }
  }

  private async fetchAssetDefinitions(client: IrohaBalanceClient): Promise<IrohaAssetDefinitionListResponse> {
    try {
      return await client.getAssetDefinitions<IrohaAssetDefinitionListResponse>();
    } catch (error) {
      console.warn('Failed to fetch Iroha asset definitions', error);

      return { items: [] };
    }
  }

  private getIrohaNetworks(networks: string[]): NetworkJson[] {
    const activeIrohaNetworks = this.state.networkService.activeNetworkByEcosystem.iroha ?? [];

    if (networks.length) {
      const selected = activeIrohaNetworks.filter((network) =>
        networks.some((requestedNetwork) => this.matchesNetwork(network, requestedNetwork))
      );

      if (selected.length) return selected;

      return networks
        .map((network) => this.resolveNetwork(network))
        .filter((network): network is NetworkJson => network?.ecosystem === 'iroha');
    }

    if (activeIrohaNetworks.length) return activeIrohaNetworks;

    const fallback = this.state.networkService.networkMap[IROHA_FALLBACK_NETWORK];

    if (fallback?.ecosystem === 'iroha') return [fallback];

    const firstIrohaNetwork = Object.values(this.state.networkService.networkMap).find(
      ({ ecosystem }) => ecosystem === 'iroha'
    );

    return firstIrohaNetwork ? [firstIrohaNetwork] : [];
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

  private getIrohaNetworkKey(network: NetworkJson): IrohaNetworkKey {
    const discriminant = (network as { chainDiscriminant?: unknown; i105Prefix?: unknown }).chainDiscriminant ??
      (network as { i105Prefix?: unknown }).i105Prefix;
    const descriptor = `${network.chainId} ${network.name} ${network.key} ${(network.options ?? []).join(' ')}`.toLowerCase();

    if (discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant || descriptor.includes('nexus')) {
      return 'nexus';
    }

    return 'taira';
  }

  private getRuntimeToriiBaseUrl(network: NetworkJson): string | null {
    const provider = network.currentProvider ? network.providers?.[network.currentProvider] : undefined;
    const node = network.nodes?.find(({ url }) => !!url)?.url;

    return provider ?? node ?? UNIVERSAL_WALLET_IROHA_NETWORKS[this.getIrohaNetworkKey(network)].toriiBaseUrl;
  }

  private isAddressForNetwork(address: string, network: IrohaNetworkKey): boolean {
    try {
      parseIrohaI105Address(address, network);

      return true;
    } catch {
      return false;
    }
  }

  private normalizeAssetItems(body: IrohaAccountAssetListResponse): IrohaAccountAssetListItem[] {
    if (!body || !Array.isArray(body.items)) return [];

    return body.items.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.asset !== 'string' || !item.asset) return false;

      const quantity = this.getQuantity(item);

      return typeof quantity === 'string' && quantity.length > 0;
    });
  }

  private getAssetDefinitionMap(response: IrohaAssetDefinitionListResponse): Map<string, IrohaAssetDefinitionListItem> {
    const definitions = new Map<string, IrohaAssetDefinitionListItem>();

    if (!response || !Array.isArray(response.items)) return definitions;

    response.items.forEach((item) => {
      if (!item || typeof item.id !== 'string' || !item.id) return;

      definitions.set(item.id, item);
    });

    return definitions;
  }

  private getNativeAsset(network: NetworkJson): { id: string; icon: string; precision: number; symbol: string } {
    const asset = network.assets.find(({ isUtility, isNative }) => isUtility || isNative);

    return {
      id: asset?.id ?? IROHA_FALLBACK_ASSET_ID,
      icon: asset?.icon ?? IROHA_FALLBACK_ICON,
      precision: asset?.precision ?? 0,
      symbol: asset?.symbol ?? IROHA_FALLBACK_SYMBOL,
    };
  }

  private setNativeBalance(address: string, network: NetworkJson, balance: string | undefined, state: APIItemState): void {
    const { id, icon, precision, symbol } = this.getNativeAsset(network);
    const balanceString = balance ?? '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol, symbol);
    const balanceItem = this.createBalanceItem({
      address,
      assetId: id,
      balance: balanceString,
      icon: network.icon || icon,
      isNative: true,
      isUtility: true,
      network,
      precision,
      state,
      symbol,
    });

    this.upsertBalanceItem(tokenGroup, balanceItem, network, address);
  }

  private setAssetBalance(
    address: string,
    network: NetworkJson,
    item: IrohaAccountAssetListItem,
    definition: IrohaAssetDefinitionListItem | undefined
  ): void {
    const assetId = this.getAssetId(item);
    const quantity = this.getQuantity(item);
    const networkAsset = network.assets.find(({ id, symbol }) => id === assetId || isSameString(symbol, assetId));
    const metadata = definition?.metadata ?? {};
    const symbol = this.getSymbol(item, definition, networkAsset?.symbol);
    const tokenName = definition?.name ?? this.getString(item.asset_name ?? item.assetName) ?? symbol;
    const precision = networkAsset?.precision ?? this.getMetadataPrecision(metadata) ?? 0;
    const icon = networkAsset?.icon ?? network.icon ?? IROHA_FALLBACK_ICON;
    const tokenGroup = this.getOrCreateTokenGroup(address, network, assetId, icon, symbol, tokenName);
    const balanceItem = this.createBalanceItem({
      address,
      assetId,
      balance: quantity,
      icon,
      isNative: networkAsset?.isNative ?? false,
      isUtility: networkAsset?.isUtility ?? false,
      network,
      precision,
      state: APIItemState.READY,
      symbol,
    });

    this.upsertBalanceItem(tokenGroup, balanceItem, network, address);
  }

  private createBalanceItem({
    address,
    assetId,
    balance,
    icon,
    isNative,
    isUtility,
    network,
    precision,
    state,
    symbol,
  }: {
    address: string;
    assetId: string;
    balance: string;
    icon: string;
    isNative: boolean;
    isUtility: boolean;
    network: NetworkJson;
    precision: number;
    state: APIItemState;
    symbol: string;
  }): BalanceItem {
    return {
      address,
      icon,
      id: assetId,
      isNative: isNative || undefined,
      isUtility,
      mainNetwork: network.name,
      name: network.name,
      precision,
      relayChain: 'iroha' as RelayChainName,
      reserved: '0',
      frozen: '0',
      locked: '0',
      free: balance,
      total: balance,
      transferable: balance,
      state,
      symbol,
      type: 'iroha',
      timestamp: Date.now(),
    };
  }

  private upsertBalanceItem(
    tokenGroup: TokenGroup,
    balanceItem: BalanceItem,
    network: NetworkJson,
    address: string
  ): void {
    const existingIndex = tokenGroup.balances.findIndex(({ name }) => isSameString(name, network.name));

    if (existingIndex === -1) tokenGroup.balances.push(balanceItem);
    else tokenGroup.balances[existingIndex] = { ...tokenGroup.balances[existingIndex], ...balanceItem };

    this.state.balanceService.updateBalanceStore(network.name, balanceItem, address);
    this.state.timeoutService.lazyNext('setIrohaBalanceItem', () => this.state.balanceService.publishBalance(), 500);
  }

  private markCachedBalancesErrored(address: string, network: NetworkJson): ResponseBalanceRequest[] {
    const groups = this.state.balanceService.balanceMap[address] ?? [];
    const balances: ResponseBalanceRequest[] = [];

    groups
      .filter(({ relayChain }) => isSameString(relayChain, 'iroha'))
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
      this.state.timeoutService.lazyNext('setIrohaBalanceItem', () => this.state.balanceService.publishBalance(), 500);
    }

    return balances;
  }

  private getOrCreateTokenGroup(
    address: string,
    network: NetworkJson,
    assetId: string,
    assetIcon: string,
    symbol: string,
    tokenName: string
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && isSameString(relayChain, 'iroha')
    );

    if (existing) {
      existing.mainNetwork = network.name;
      existing.relayChain = 'iroha' as RelayChainName;

      return existing;
    }

    const tokenGroup: TokenGroup = {
      balances: [],
      groupId: assetId,
      icon: assetIcon,
      mainNetwork: network.name,
      priceId: symbol,
      providers: [],
      relayChain: 'iroha' as RelayChainName,
      symbol,
      tokenName,
    };

    this.state.balanceService.balanceMap[address].push(tokenGroup);

    return tokenGroup;
  }

  private getAssetId(item: IrohaAccountAssetListItem): string {
    return this.getString(item.asset_id ?? item.assetId) ?? item.asset;
  }

  private getQuantity(item: IrohaAccountAssetListItem): string {
    return this.getString(item.quantity ?? item.value) ?? '0';
  }

  private getSymbol(
    item: IrohaAccountAssetListItem,
    definition: IrohaAssetDefinitionListItem | undefined,
    networkSymbol: string | undefined
  ): string {
    const metadata = definition?.metadata ?? {};
    const metadataSymbol = this.getString(metadata.symbol ?? metadata.ticker);
    const alias = this.getString(item.asset_alias ?? item.assetAlias ?? definition?.alias);
    const raw = networkSymbol ?? metadataSymbol ?? alias ?? this.getString(item.asset_name ?? item.assetName) ?? item.asset;
    const symbol = raw.split('#')[0].trim();

    return symbol ? symbol.toUpperCase() : IROHA_FALLBACK_SYMBOL;
  }

  private getMetadataPrecision(metadata: Record<string, unknown>): number | undefined {
    const value = metadata.precision ?? metadata.decimals ?? metadata.scale;

    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) return value;

    if (typeof value === 'string' && /^[0-9]+$/u.test(value)) {
      const parsed = Number(value);

      if (parsed >= 0 && parsed <= 255) return parsed;
    }

    return undefined;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}

export type { IrohaBalanceClient, IrohaBalanceClientFactory };
