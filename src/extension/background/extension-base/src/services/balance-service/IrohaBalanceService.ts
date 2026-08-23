import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import {
  createIrohaToriiWalletClient,
  type IrohaToriiRouteResponse,
} from '@extension-base/services/iroha-torii-service';
import { reconcileSuccessfulDynamicScan } from './reconcileSuccessfulScan';
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
  has_more?: boolean;
  hasMore?: boolean;
  total?: number | string;
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
  has_more?: boolean;
  hasMore?: boolean;
  total?: number | string;
};

type IrohaAssetDefinitionListItem = {
  id: string;
  name?: string;
  alias?: string;
  metadata?: Record<string, unknown> | null;
  spec?: {
    scale?: number | null;
  } | null;
};

type IrohaBalanceClient = {
  getAccountAssets<TBody = unknown>(
    accountId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<IrohaToriiRouteResponse<TBody>>;
  getAssetDefinitions<TBody = unknown>(options?: {
    assetId?: string;
    limit?: number;
    offset?: number;
  }): Promise<IrohaToriiRouteResponse<TBody>>;
};

type IrohaBalanceClientFactory = (network: NetworkJson, irohaNetwork: IrohaNetworkKey) => IrohaBalanceClient;

const IROHA_FALLBACK_NETWORK = 'Taira';
const IROHA_NEXUS_FALLBACK_ASSET_ID = 'xor#sora';
const IROHA_FALLBACK_ICON = 'iroha';
const IROHA_FALLBACK_SYMBOL = 'XOR';
const IROHA_BALANCE_PAGE_SIZE = 200;
const IROHA_DEFINITION_PAGE_SIZE = 200;

export default class IrohaBalanceService {
  private readonly clientFactory: IrohaBalanceClientFactory;

  constructor(
    private readonly state: State,
    clientFactory?: IrohaBalanceClientFactory
  ) {
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
      irohaNetworks.map((network) =>
        this.fetchNetworkBalance(
          accountAddress,
          this.resolveWalletAddress(accountAddress, irohaAddress ?? address, network),
          network
        )
      )
    );

    return results.flat();
  }

  private resolveWalletAddress(
    accountAddress: string,
    fallback: string | undefined,
    network: NetworkJson
  ): string | undefined {
    const account = this.state.keyringService
      ?.getAllMainAccounts?.()
      .find(({ address }) => isSameString(address, accountAddress));
    const publicAccount = account?.meta.universalWallet?.publicAccounts.find(
      (item) => item.ecosystem === 'iroha' && item.chainId === network.chainId
    );

    return publicAccount?.address ?? fallback;
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
      const items = await this.fetchAllAccountAssets(client, walletAddress);
      const requiredDefinitionIds = new Set(items.map((item) => this.getAssetId(item)));

      if (irohaNetwork === 'taira') {
        requiredDefinitionIds.add(UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id);
      }

      if (!requiredDefinitionIds.size) {
        this.setNativeBalance(accountAddress, network, undefined, APIItemState.READY);
        reconcileSuccessfulDynamicScan(this.state, {
          address: accountAddress,
          network: network.name,
          observedAssetIds: [],
          includes: ({ isNative, isUtility, type }) => type === 'iroha' && !isNative && !isUtility,
        });

        return [{ assetId: nativeAsset.id, balance: '0', network: network.name }];
      }

      const definitionsResponse = await this.fetchAssetDefinitions(client, requiredDefinitionIds);
      const definitions = this.getAssetDefinitionMap(definitionsResponse);
      this.validateTairaNativeDefinition(network, definitions);

      if (!items.length) {
        this.setNativeBalance(accountAddress, network, undefined, APIItemState.READY);
        reconcileSuccessfulDynamicScan(this.state, {
          address: accountAddress,
          network: network.name,
          observedAssetIds: [],
          includes: ({ isNative, isUtility, type }) => type === 'iroha' && !isNative && !isUtility,
        });

        return [{ assetId: nativeAsset.id, balance: '0', network: network.name }];
      }

      items.forEach((item) => {
        const assetId = this.getAssetId(item);
        const definition = definitions.get(assetId);

        if (!definition) throw new Error(`iroha_asset_definition_missing:${assetId}`);

        this.setAssetBalance(accountAddress, network, item, definition);
      });
      const observedAssetIds = items.map((item) => this.getAssetId(item));
      if (!observedAssetIds.includes(nativeAsset.id)) {
        this.setNativeBalance(accountAddress, network, undefined, APIItemState.READY);
      }
      reconcileSuccessfulDynamicScan(this.state, {
        address: accountAddress,
        network: network.name,
        observedAssetIds,
        includes: ({ isNative, isUtility, type }) => type === 'iroha' && !isNative && !isUtility,
      });

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

  private async fetchAllAccountAssets(
    client: IrohaBalanceClient,
    accountId: string
  ): Promise<IrohaAccountAssetListItem[]> {
    const assets = new Map<string, IrohaAccountAssetListItem>();
    const seenPages = new Set<string>();
    let offset = 0;

    while (true) {
      const response = await client.getAccountAssets<IrohaAccountAssetListResponse>(accountId, {
        limit: IROHA_BALANCE_PAGE_SIZE,
        offset,
      });
      const page = this.normalizeAssetItems(response.body);
      const rawPageSize = Array.isArray(response.body?.items) ? response.body.items.length : 0;
      const fingerprint = page.map((item) => `${this.getAssetId(item)}=${this.getQuantity(item)}`).join('|');

      if (seenPages.has(fingerprint)) throw new Error('iroha_pagination_cycle');
      seenPages.add(fingerprint);

      page.forEach((item) => {
        const assetId = this.getAssetId(item);
        const existing = assets.get(assetId);
        const quantity = existing
          ? new FPNumber(this.getQuantity(existing)).add(new FPNumber(this.getQuantity(item))).toString()
          : this.getQuantity(item);

        assets.set(assetId, { ...(existing ?? item), quantity, value: undefined });
      });

      const explicitHasMore = response.body?.has_more ?? response.body?.hasMore;
      const total = Number(response.body?.total);
      const nextOffset = offset + rawPageSize;
      const totalHasMore = Number.isSafeInteger(total) && total >= 0 ? nextOffset < total : false;
      const shouldContinue =
        explicitHasMore === true ||
        totalHasMore ||
        (explicitHasMore === undefined && rawPageSize >= IROHA_BALANCE_PAGE_SIZE);

      if (!shouldContinue || rawPageSize === 0) break;
      offset = nextOffset;
    }

    return [...assets.values()];
  }

  private async fetchAssetDefinitions(
    client: IrohaBalanceClient,
    heldAssetIds: Set<string>
  ): Promise<IrohaAssetDefinitionListResponse> {
    const definitions = new Map<string, IrohaAssetDefinitionListItem>();
    const seenPages = new Set<string>();
    let offset = 0;

    while (true) {
      const response = await client.getAssetDefinitions<IrohaAssetDefinitionListResponse>({
        limit: IROHA_DEFINITION_PAGE_SIZE,
        offset,
      });
      const page = this.normalizeDefinitionItems(response.body);
      const rawPageSize = Array.isArray(response.body?.items) ? response.body.items.length : 0;
      const fingerprint = page.map(({ id }) => id).join('|');

      if (rawPageSize > 0 && seenPages.has(fingerprint)) throw new Error('iroha_definition_pagination_cycle');
      if (rawPageSize > 0) seenPages.add(fingerprint);

      page.forEach((definition) => {
        if (definitions.has(definition.id)) {
          throw new Error(`iroha_duplicate_asset_definition:${definition.id}`);
        }
        definitions.set(definition.id, definition);
      });

      if ([...heldAssetIds].every((assetId) => definitions.has(assetId))) break;

      const explicitHasMore = response.body?.has_more ?? response.body?.hasMore;
      const total = Number(response.body?.total);
      const nextOffset = offset + rawPageSize;
      const totalHasMore = Number.isSafeInteger(total) && total >= 0 ? nextOffset < total : false;
      const shouldContinue =
        explicitHasMore === true ||
        totalHasMore ||
        (explicitHasMore === undefined && rawPageSize >= IROHA_DEFINITION_PAGE_SIZE);

      if (!shouldContinue || rawPageSize === 0) break;
      offset = nextOffset;
    }

    return { items: [...definitions.values()] };
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
    if (network.chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId) return 'taira';
    if (network.chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId) return 'nexus';

    throw new Error(`unsupported_iroha_chain_id:${network.chainId ?? 'missing'}`);
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

  private normalizeDefinitionItems(response: IrohaAssetDefinitionListResponse): IrohaAssetDefinitionListItem[] {
    if (!response || !Array.isArray(response.items)) return [];

    return response.items.filter(
      (item): item is IrohaAssetDefinitionListItem =>
        !!item && typeof item === 'object' && typeof item.id === 'string' && item.id.length > 0
    );
  }

  private getNativeAsset(network: NetworkJson): {
    id: string;
    icon: string;
    precision: number;
    symbol: string;
    priceId?: string;
  } {
    const asset = network.assets.find(({ isUtility, isNative }) => isUtility || isNative);
    const tairaNative = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset;
    const isTaira = this.getIrohaNetworkKey(network) === 'taira';

    return {
      id: asset?.id ?? (isTaira ? tairaNative.id : IROHA_NEXUS_FALLBACK_ASSET_ID),
      icon: asset?.icon ?? IROHA_FALLBACK_ICON,
      precision: asset?.precision ?? (isTaira ? tairaNative.decimals : 0),
      symbol: asset?.symbol ?? (isTaira ? tairaNative.symbol : IROHA_FALLBACK_SYMBOL),
      priceId: asset?.priceId,
    };
  }

  private setNativeBalance(
    address: string,
    network: NetworkJson,
    balance: string | undefined,
    state: APIItemState
  ): void {
    const { id, icon, precision, symbol, priceId } = this.getNativeAsset(network);
    const balanceString = balance ?? '0';
    const tokenGroup = this.getOrCreateTokenGroup(address, network, id, icon, symbol, symbol, priceId);
    const balanceItem = this.createBalanceItem({
      address,
      assetId: id,
      balance: balanceString,
      icon: network.icon || icon,
      isNative: true,
      isUtility: true,
      network,
      precision,
      priceId,
      state,
      symbol,
      trust: 'verified',
      source: 'registry',
    });

    this.upsertBalanceItem(tokenGroup, balanceItem, network, address);
  }

  private setAssetBalance(
    address: string,
    network: NetworkJson,
    item: IrohaAccountAssetListItem,
    definition: IrohaAssetDefinitionListItem
  ): void {
    const assetId = this.getAssetId(item);
    const quantity = this.getQuantity(item);
    const networkAsset = network.assets.find(({ id, currencyId }) => id === assetId || currencyId === assetId);
    const symbol = this.getSymbol(item, definition, networkAsset?.symbol);
    const tokenName = definition?.name ?? this.getString(item.asset_name ?? item.assetName) ?? symbol;
    const precision = this.getDefinitionScale(definition);

    if (precision === undefined) throw new Error(`iroha_asset_scale_missing:${assetId}`);
    if (networkAsset?.precision !== undefined && networkAsset.precision !== precision) {
      throw new Error(`iroha_asset_scale_mismatch:${assetId}`);
    }
    const icon = networkAsset?.icon ?? network.icon ?? IROHA_FALLBACK_ICON;
    const tokenGroup = this.getOrCreateTokenGroup(
      address,
      network,
      assetId,
      icon,
      symbol,
      tokenName,
      networkAsset?.priceId
    );
    const balanceItem = this.createBalanceItem({
      address,
      assetId,
      balance: quantity,
      icon,
      isNative: networkAsset?.isNative ?? false,
      isUtility: networkAsset?.isUtility ?? false,
      network,
      precision,
      priceId: networkAsset?.priceId,
      state: APIItemState.READY,
      symbol,
      trust: networkAsset ? 'verified' : 'unverified',
      source: networkAsset ? 'registry' : 'chain',
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
    priceId,
    source,
    state,
    symbol,
    trust,
  }: {
    address: string;
    assetId: string;
    balance: string;
    icon: string;
    isNative: boolean;
    isUtility: boolean;
    network: NetworkJson;
    precision: number;
    priceId?: string;
    source: NonNullable<BalanceItem['assetMetadataSource']>;
    state: APIItemState;
    symbol: string;
    trust: NonNullable<BalanceItem['assetMetadataTrust']>;
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
      priceId,
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
      assetMetadataTrust: trust,
      assetMetadataSource: source,
      scanCoverage: state === APIItemState.READY ? 'complete' : 'limited',
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
          timestamp: existing.timestamp,
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
    tokenName: string,
    priceId?: string
  ): TokenGroup {
    if (!this.state.balanceService.balanceMap[address]) this.state.balanceService.balanceMap[address] = [];

    const existing = this.state.balanceService.balanceMap[address].find(
      ({ groupId, relayChain }) => groupId === assetId && isSameString(relayChain, 'iroha')
    );

    if (existing) {
      existing.mainNetwork = network.name;
      existing.relayChain = 'iroha' as RelayChainName;
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
    const raw =
      networkSymbol ?? metadataSymbol ?? alias ?? this.getString(item.asset_name ?? item.assetName) ?? item.asset;
    const symbol = raw.split('#')[0].trim();

    return symbol ? symbol.toUpperCase() : IROHA_FALLBACK_SYMBOL;
  }

  private getDefinitionScale(definition: IrohaAssetDefinitionListItem | undefined): number | undefined {
    const scale = definition?.spec?.scale;

    return typeof scale === 'number' && Number.isInteger(scale) && scale >= 0 && scale <= 28 ? scale : undefined;
  }

  private validateTairaNativeDefinition(
    network: NetworkJson,
    definitions: Map<string, IrohaAssetDefinitionListItem>
  ): void {
    if (this.getIrohaNetworkKey(network) !== 'taira') return;

    const canonical = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset;
    const configured = this.getNativeAsset(network);
    const definition = definitions.get(canonical.id);

    if (
      configured.id !== canonical.id ||
      configured.symbol !== canonical.symbol ||
      configured.precision !== canonical.decimals ||
      !definition ||
      this.getDefinitionScale(definition) !== canonical.decimals
    ) {
      throw new Error('iroha_taira_native_asset_definition_mismatch');
    }
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}

export type { IrohaBalanceClient, IrohaBalanceClientFactory };
