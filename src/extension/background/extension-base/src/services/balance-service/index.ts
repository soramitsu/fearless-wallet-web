import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { Subject } from 'rxjs';
import { PREP_NETWORKS_NAME } from '@extension-base/const/networks';
import { type GetBalancesProps } from '../subscription-service';
import { TonBalance } from '../ton-balance/TonBalance';
import SubstrateBalanceService from './SubstrateBalanceService';
import EvmBalanceService from './EvmBalanceService';
import SolanaBalanceService from './SolanaBalanceService';
import BitcoinBalanceService from './BitcoinBalanceService';
import IrohaBalanceService from './IrohaBalanceService';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem, NetworkScanState } from '@extension-base/api/evm/types';
import type {
  BalanceMap,
  BalanceJson,
  IState,
  RequestTotalBalances,
  ResponseTotalBalances,
  RequestPortfolioHoldings,
  ResponsePortfolioHoldings,
  ResponseBalanceRequest,
  TokenGroup,
} from '@extension-base/background/types/types';
import { getMockAssets } from '@/extension/background/extension-base/src/background/helpers/assets';
import { isSameString, isTonNetwork } from '@/helpers';
import { type RelayChainName, WalletEcosystem, type NetworkName } from '@/interfaces';
import { buildPortfolioSummary, createAssetKey, getPortfolioAssetId } from '@/portfolio/assetIdentity';
import { buildWalletHoldings } from '@/portfolio/dashboard/holdings';

const MAX_HIDDEN_KEYS_PER_WALLET = 5000;

/** Keeps only string keys, per string address; the request only labels a total and never moves value. */
function sanitizeHiddenKeysByAddress(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([address, keys]) => [
        address,
        keys.filter((key): key is string => typeof key === 'string').slice(0, MAX_HIDDEN_KEYS_PER_WALLET),
      ])
  );
}

interface NetworkBalanceRefresh {
  failed: boolean;
  coversNetwork: boolean;
  unknownFailure?: boolean;
}

type BalanceStorage = Pick<IState, 'assetBalances' | 'networkScanStates'>;

interface BalanceStorageMutation {
  /** Applies one change to the copy read for this write and names the keys it changed. */
  apply: (stored: BalanceStorage) => (keyof BalanceStorage)[];
  resolve: () => void;
  reject: (error: unknown) => void;
}

// Balance changes this close together share one read and one write of the cache, which holds every wallet's assets.
export const BALANCE_STORAGE_WRITE_DELAY_MS = 200;

export default class BalanceService {
  substrateBalanceService: SubstrateBalanceService;
  evmBalanceService: EvmBalanceService;
  tonBalanceService: TonBalance;
  solanaBalanceService: SolanaBalanceService;
  bitcoinBalanceService: BitcoinBalanceService;
  irohaBalanceService: IrohaBalanceService;
  balanceMap: BalanceMap = {};
  networkScanStates: Record<string, Record<string, NetworkScanState>> = {};
  balanceSubject = new Subject<BalanceJson>();
  private balanceStorageMutation = Promise.resolve();
  private pendingBalanceStorageMutations: BalanceStorageMutation[] = [];
  private balanceStorageWriteTimer?: ReturnType<typeof setTimeout>;
  private networkRefreshQueue = new Map<string, Promise<unknown>>();
  private activeNetworkRefreshes = new Map<string, NetworkBalanceRefresh>();

  constructor(private state: State) {
    this.substrateBalanceService = new SubstrateBalanceService(state);
    this.evmBalanceService = new EvmBalanceService(state);
    this.tonBalanceService = new TonBalance(state);
    this.solanaBalanceService = new SolanaBalanceService(state);
    this.bitcoinBalanceService = new BitcoinBalanceService(state);
    this.irohaBalanceService = new IrohaBalanceService(state);
  }

  public async hydrateBalanceStorage(addresses: string[]): Promise<void> {
    const { assetBalances, networkScanStates } = await storage.get(['assetBalances', 'networkScanStates']);

    addresses.forEach((address) => {
      this.networkScanStates[address] = { ...(networkScanStates?.[address] ?? {}) };
      const cached = assetBalances?.[address];
      if (!cached) return;
      if (!this.balanceMap[address]) this.balanceMap[address] = [];

      Object.entries(cached).forEach(([storedKey, cachedItem]) => {
        if (!cachedItem?.id || !cachedItem.chain || cachedItem.state !== APIItemState.READY) return;
        if (storedKey !== this.getStorageAssetKey(cachedItem.chain, cachedItem)) return;

        const item = this.withRegistryPriceId(cachedItem);
        const group = this.balanceMap[address].find(({ balances }) =>
          balances.some(
            (balance) =>
              isSameString(balance.name, item.chain) &&
              this.getStorageAssetKey(item.chain, balance) === storedKey
          )
        );
        const existing = group?.balances.findIndex(
          (balance) =>
            isSameString(balance.name, item.chain) &&
            this.getStorageAssetKey(item.chain, balance) === storedKey
        ) ?? -1;

        if (group && existing >= 0) {
          group.balances[existing] = { ...group.balances[existing], ...item };
          if ('priceId' in item) group.priceId = item.priceId;
          return;
        }

        const sameAssetGroup = this.findIndexerAssetGroup(address, item.id, item.relayChain);

        if (sameAssetGroup) {
          sameAssetGroup.balances.push({ ...item });
          return;
        }

        this.balanceMap[address].push({
          balances: [{ ...item }],
          groupId: item.id,
          icon: item.assetIcon ?? item.icon,
          mainNetwork: item.chain,
          priceId: item.priceId,
          providers: [],
          relayChain: item.relayChain as RelayChainName,
          symbol: item.symbol,
          tokenName: item.symbol,
        });
      });
    });
  }

  getAccountBalance(address: string) {
    return this.balanceMap[address];
  }

  deleteBalance(address: string) {
    if (!this.balanceMap[address]) return;

    delete this.balanceMap[address];
    delete this.networkScanStates[address];
  }

  public updateBalanceStore(networkKey: string, item: BalanceItem, address: string) {
    const itemSnapshot = { ...item };

    return this.enqueueBalanceStorageMutation((stored) =>
      this.updateBalanceStorage(networkKey, address, itemSnapshot, stored)
    ).catch((e) => console.warn(e));
  }

  public async refreshNetworkBalances<T>(
    chain: string, address: string, refresh: () => Promise<T>, coversNetwork: boolean
  ): Promise<T> {
    const key = JSON.stringify([address, chain]);
    const previous = this.networkRefreshQueue.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const scan: NetworkBalanceRefresh = { failed: false, coversNetwork };
      this.activeNetworkRefreshes.set(key, scan);

      try {
        return await refresh();
      } catch (error) {
        scan.failed = true;
        throw error;
      } finally {
        try {
          // Asset writes are queued synchronously by setBalanceItem. Finish only after all of them persist.
          await this.enqueueBalanceStorageMutation((stored) => this.finishNetworkRefresh(chain, address, scan, stored));
        } finally {
          this.activeNetworkRefreshes.delete(key);
        }
      }
    });
    this.networkRefreshQueue.set(key, pending);

    try {
      return await pending;
    } finally {
      if (this.networkRefreshQueue.get(key) === pending) this.networkRefreshQueue.delete(key);
    }
  }

  private finishNetworkRefresh(
    chain: string, address: string, scan: NetworkBalanceRefresh, stored: BalanceStorage
  ): (keyof BalanceStorage)[] {
    const accountScanStates = { ...(stored.networkScanStates[address] ?? {}) };
    const previous = accountScanStates[chain];
    const failed = scan.failed || Boolean(previous?.failedAssetKeys?.length) ||
      (!scan.coversNetwork && Boolean(scan.unknownFailure));
    const now = Date.now();
    accountScanStates[chain] = {
      lastAttempt: now,
      lastSuccess: failed ? previous?.lastSuccess : now,
      stale: failed,
      coverage: previous?.coverage ?? 'limited',
      ...(failed ? { error: 'balance_scan_failed', failedAssetKeys: previous?.failedAssetKeys } : {}),
    };
    stored.networkScanStates[address] = accountScanStates;
    this.networkScanStates[address] = accountScanStates;
    this.state.timeoutService.lazyNext('setBalanceItem', () => this.publishBalance(), 500);

    return ['networkScanStates'];
  }

  public deleteBalanceStore(
    networkKey: string,
    identity: Pick<BalanceItem, 'id'> & Partial<BalanceItem>,
    address: string
  ) {
    const identitySnapshot = { ...identity };
    return this.enqueueBalanceStorageMutation((stored) =>
      this.deleteBalanceStorage(networkKey, identitySnapshot, address, stored)
    );
  }

  /** Resolves once the change is written, together with every other change made within the write delay. */
  private enqueueBalanceStorageMutation(apply: BalanceStorageMutation['apply']): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pendingBalanceStorageMutations.push({ apply, resolve, reject });
      this.balanceStorageWriteTimer ??= setTimeout(() => {
        this.balanceStorageWriteTimer = undefined;
        this.balanceStorageMutation = this.balanceStorageMutation.then(() => this.writeBalanceStorage());
      }, BALANCE_STORAGE_WRITE_DELAY_MS);
    });
  }

  /**
   * Reads the cache once, applies the queued changes in the order they were made and writes the changed keys once.
   * Reading first keeps what other wallets and earlier writes stored.
   */
  private async writeBalanceStorage(): Promise<void> {
    const mutations = this.pendingBalanceStorageMutations.splice(0);

    if (!mutations.length) return;

    try {
      const { assetBalances, networkScanStates } = await storage.get(['assetBalances', 'networkScanStates']);
      const stored: BalanceStorage = {
        assetBalances: { ...(assetBalances ?? {}) },
        networkScanStates: { ...(networkScanStates ?? {}) },
      };
      const changed = new Set<keyof BalanceStorage>();
      const failures = mutations.map(({ apply }) => {
        try {
          apply(stored).forEach((key) => changed.add(key));

          return undefined;
        } catch (error) {
          return { error };
        }
      });
      const write: Partial<BalanceStorage> = {};

      if (changed.has('assetBalances')) write.assetBalances = stored.assetBalances;
      if (changed.has('networkScanStates')) write.networkScanStates = stored.networkScanStates;
      if (changed.size) await storage.set(write);

      mutations.forEach(({ resolve, reject }, index) => {
        const failure = failures[index];

        if (failure) reject(failure.error);
        else resolve();
      });
    } catch (error) {
      mutations.forEach(({ reject }) => reject(error));
    }
  }

  private deleteBalanceStorage(
    chain: string,
    identity: Pick<BalanceItem, 'id'> & Partial<BalanceItem>,
    address: string,
    stored: BalanceStorage
  ): (keyof BalanceStorage)[] {
    const canonicalForAccount = { ...(stored.assetBalances[address] ?? {}) };
    const canonicalKey = this.getStorageAssetKey(chain, identity);

    if (!canonicalForAccount[canonicalKey]) return [];

    delete canonicalForAccount[canonicalKey];
    if (Object.keys(canonicalForAccount).length) stored.assetBalances[address] = canonicalForAccount;
    else delete stored.assetBalances[address];

    return ['assetBalances'];
  }

  private updateBalanceStorage(
    chain: string, address: string, item: BalanceItem, stored: BalanceStorage
  ): (keyof BalanceStorage)[] {
    if (item.state !== APIItemState.READY && item.state !== APIItemState.ERROR) return [];

    const accountScanStates = { ...(stored.networkScanStates[address] ?? {}) };
    const previousScan = accountScanStates[chain];
    const now = Date.now();
    const coverage = item.scanCoverage ?? previousScan?.coverage ?? 'limited';
    const canonicalKey = this.getStorageAssetKey(chain, item);
    const failedAssetKeys = new Set(previousScan?.failedAssetKeys ?? []);
    const scan = this.activeNetworkRefreshes.get(JSON.stringify([address, chain]));
    if (scan) scan.unknownFailure ??= Boolean(previousScan?.stale && !previousScan.failedAssetKeys?.length);

    if (item.state === APIItemState.ERROR) {
      failedAssetKeys.add(canonicalKey);
      if (scan) scan.failed = true;
    } else {
      failedAssetKeys.delete(canonicalKey);
    }
    // A successful asset cannot clear another asset's failure, or declare an unfinished refresh successful.
    const failed = failedAssetKeys.size > 0 || Boolean(scan && (scan.failed || previousScan?.stale));
    accountScanStates[chain] = {
      lastAttempt: now,
      lastSuccess: failed || scan ? previousScan?.lastSuccess : item.timestamp ?? now,
      stale: failed,
      coverage,
      ...(failed ? { error: 'balance_scan_failed' } : {}),
      ...(failedAssetKeys.size ? { failedAssetKeys: [...failedAssetKeys] } : {}),
    };
    stored.networkScanStates[address] = accountScanStates;
    this.networkScanStates[address] = accountScanStates;

    if (item.state === APIItemState.ERROR) return ['networkScanStates'];

    stored.assetBalances[address] = {
      ...(stored.assetBalances[address] ?? {}),
      [canonicalKey]: { chain, ...item } as BalanceItem & { chain: NetworkName },
    };

    return ['assetBalances', 'networkScanStates'];
  }

  /**
   * The cache key of one balance: its network and registry asset id. Two assets of one network may share a
   * `currencyId` (Bifrost vKSM and vsKSM), so that id would let one asset's cached amount overwrite the other's.
   */
  private getStorageAssetKey(
    chain: string,
    item: Pick<BalanceItem, 'id'> & Partial<BalanceItem>
  ): string {
    const network = this.state.networkService?.networkValues?.find(({ name }) => isSameString(name, chain));
    const ecosystem = String(network?.ecosystem ?? item.relayChain ?? 'unknown');
    const chainId = String(network?.chainId ?? chain);
    const assetId = getPortfolioAssetId(item);

    return createAssetKey({ ecosystem, chainId, assetId });
  }

  /**
   * A cached balance of a registry asset takes the registry's price id of today, not the one it was cached with:
   * the registry may have corrected it since, and an asset on the untrusted list has none.
   */
  private withRegistryPriceId<T extends BalanceItem & { chain: string }>(item: T): T {
    const network = this.state.networkService?.networkValues?.find(({ name }) => isSameString(name, item.chain));
    const registryAsset = network?.assets?.find(({ id }) => id === item.id);

    return registryAsset ? { ...item, priceId: registryAsset.priceId || undefined } : item;
  }

  public async updateUtilityED(networkName: NetworkName): Promise<void> {
    const existentialDeposit =
      this.state.networkService.substrateApiHandler.api[
        networkName
      ].api?.consts?.balances?.existentialDeposit.toString();

    const allAccounts = this.state.keyringService.getAllSubstrateAccounts();

    if (!allAccounts) return;

    allAccounts.forEach(({ address }) => {
      const currencyIndex = this.balanceMap[address].findIndex(({ balances }) =>
        balances.find(({ isUtility, name }) => isUtility && isSameString(name, networkName))
      );

      const token = this.balanceMap[address][currencyIndex];
      const index = token.balances.findIndex(({ name }) => isSameString(name, networkName));

      this.balanceMap[address][currencyIndex].balances[index].existentialDeposit =
        existentialDeposit?.toString() ?? '0';
    });
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const isAccountExists = this.state.keyringService.getAllMainAccounts().some((el) => el.address === address);

    if (!isAccountExists) return;

    const accountAddress = this.state.keyringService.getSubstrateAddress(address);

    const groupIndex = this.balanceMap[accountAddress].findIndex(({ balances }) =>
      balances.some(({ id, name }) => id === item.id && isSameString(PREP_NETWORKS_NAME[name] ?? name, networkKey))
    );

    if (groupIndex === -1) {
      if (isTonNetwork(networkKey)) {
        this.setJettonBalanceItem(networkKey, item, accountAddress);

        return;
      } else throw new Error(`Failed to find ${item.symbol} on ${networkKey}`);
    }

    const assetIndex = this.balanceMap[accountAddress][groupIndex].balances.findIndex(({ id, name }) => {
      const key = PREP_NETWORKS_NAME[name] ?? name;

      return id === item.id && isSameString(key, networkKey);
    });

    if (assetIndex === -1) throw new Error(`Failed to find ${item.id} on ${networkKey}`);

    const existingBalance = this.balanceMap[accountAddress][groupIndex].balances[assetIndex];
    const nextItem = { ...item };

    if (item.state === APIItemState.ERROR && existingBalance.timestamp !== undefined) {
      (['free', 'reserved', 'locked', 'miscFrozen', 'frozen', 'total', 'transferable', 'muchTotal'] as const).forEach(
        (field) => delete nextItem[field]
      );
    }

    const mergedBalance: BalanceItem = {
      ...existingBalance,
      ...nextItem,
      state: item.state!,
      timestamp:
        item.state === APIItemState.ERROR
          ? existingBalance.timestamp
          : Date.now(),
    };
    this.balanceMap[accountAddress][groupIndex].balances[assetIndex] = mergedBalance;

    this.updateBalanceStore(networkKey, mergedBalance, address);

    this.state.timeoutService.lazyNext('setBalanceItem', () => this.publishBalance(), 500);
  }

  public setJettonBalanceItem(networkKey: string, item: Partial<BalanceItem>, accountAddress: string) {
    const balance: BalanceItem = {
      address: accountAddress,
      icon: item.icon!,
      name: networkKey,
      precision: item.precision!,
      state: item.state ?? APIItemState.READY,
      total: item.total,
      transferable: item.transferable,
      reserved: '0',
      frozen: '0',
      locked: '0',
      mainNetwork: networkKey,
      symbol: item.symbol!,
      type: 'jetton',
      id: item.id!,
      priceId: item.priceId,
      priceAssetKey: item.priceAssetKey,
      assetMetadataTrust: item.assetMetadataTrust,
      assetMetadataSource: item.assetMetadataSource,
      scanCoverage: item.scanCoverage,
      walletAddress: item.walletAddress,
    };

    const asset: TokenGroup = {
      icon: item.assetIcon!,
      groupId: item.id!,
      mainNetwork: networkKey,
      providers: [],
      symbol: item.symbol!,
      tokenName: item.name!,
      relayChain: item.relayChain as RelayChainName,
      priceId: item.priceId,
      balances: [balance],
    };

    this.balanceMap[accountAddress].push(asset);

    this.updateBalanceStore(networkKey, balance, accountAddress);

    this.state.timeoutService.lazyNext('setBalanceItem', () => this.publishBalance(), 500);
  }

  public async publishBalance() {
    const balance = await this.getBalance();

    return this.balanceSubject.next(balance);
  }

  /**
   * Every wallet's total for the wallet list. `total` includes hidden assets, so a wallet whose funds are all
   * hidden never looks empty there; the hidden keys the popup sends only split out `hiddenValue` for the label and
   * `visibleTotal`, which equals the portfolio header. Testnet holdings are never counted.
   */
  async getTotalBalances(request?: RequestTotalBalances | null): Promise<ResponseTotalBalances[]> {
    const hiddenKeysByAddress = sanitizeHiddenKeysByAddress(request?.hiddenKeysByAddress);

    return new Promise<ResponseTotalBalances[]>((res) =>
      this.state.pricesService.getPrice((prices) => {
        // The remote registry plus the bundled Bitcoin, Solana and Iroha networks, as in the popup header.
        const registryNetworks = this.state.networkService.networksGithub?.length
          ? this.state.networkService.authoritativeDiscoveryNetworks
          : this.state.networkService.networkValues ?? [];
        const totalBalances = Object.keys(this.balanceMap).map((address) => {
          const input = {
            groups: this.balanceMap[address],
            networks: registryNetworks,
            prices: prices.tokenPriceMap,
            priceChanges: prices.tokenPriceChange,
            addressForNetwork: () => address,
          };
          const summary = buildPortfolioSummary(input);
          const hiddenKeys = hiddenKeysByAddress[address] ?? [];
          const visible = hiddenKeys.length
            ? buildPortfolioSummary({
                ...input,
                preferences: Object.fromEntries(hiddenKeys.map((key) => [key, 'hidden' as const])),
              })
            : summary;

          return {
            address,
            total: summary.total,
            change: { amount: summary.changeAmount, percent: summary.changePercent },
            visibleTotal: visible.total,
            hiddenValue: visible.hiddenValue,
            hiddenCount: visible.hiddenCount,
            // Counted like `total`, hidden assets included: a hidden balance that failed is missing from it too.
            unavailableCount: summary.unavailableCount,
          };
        });

        res(totalBalances);
      })
    );
  }

  /**
   * Every wallet's counted holdings, for the portfolio dashboard's All wallets scope. It reads the same balance maps,
   * registry networks and prices as `getTotalBalances`, so each wallet's `total` equals that wallet's `visibleTotal`
   * for the same hidden keys. Nothing here writes, signs or moves value.
   */
  async getPortfolioHoldings(request?: RequestPortfolioHoldings | null): Promise<ResponsePortfolioHoldings[]> {
    const hiddenKeysByAddress = sanitizeHiddenKeysByAddress(request?.hiddenKeysByAddress);

    return new Promise<ResponsePortfolioHoldings[]>((res) =>
      this.state.pricesService.getPrice((prices) => {
        const registryNetworks = this.state.networkService.networksGithub?.length
          ? this.state.networkService.authoritativeDiscoveryNetworks
          : this.state.networkService.networkValues ?? [];

        res(
          Object.keys(this.balanceMap).map((address) =>
            buildWalletHoldings(
              address,
              {
                groups: this.balanceMap[address],
                networks: registryNetworks,
                prices: prices.tokenPriceMap,
                priceChanges: prices.tokenPriceChange,
                addressForNetwork: () => address,
                scanStates: this.networkScanStates[address] ?? {},
              },
              hiddenKeysByAddress[address] ?? []
            )
          )
        );
      })
    );
  }

  public async getBalance(): Promise<BalanceJson> {
    const account = this.state.currentAccount;

    if (account) {
      return new Promise((resolve) => {
        resolve({
          details: this.balanceMap[account.address] ?? [],
          scanStates: this.networkScanStates[account.address] ?? {},
        });
      });
    }

    return { details: [] };
  }

  public generateDefaultBalance(address: string, walletEcosystem: WalletEcosystem) {
    if (address === '') return;

    if (this.balanceMap?.[address] === undefined)
      this.balanceMap[address] = getMockAssets(this.state.networkService.networkMap, walletEcosystem);
  }

  private ensureUniversalDefaultBalances(address: string, ecosystems: Set<WalletEcosystem>): void {
    if (!this.balanceMap[address]) this.balanceMap[address] = [];

    ecosystems.forEach((ecosystem) => {
      getMockAssets(this.state.networkService.networkMap, ecosystem).forEach((candidate) => {
        const missingBalances = candidate.balances.filter(
          (balance) =>
            !this.balanceMap[address].some(({ balances }) =>
              balances.some(({ id, name }) => id === balance.id && isSameString(name, balance.name))
            )
        );

        if (!missingBalances.length) return;

        const sameAssetGroup = this.findIndexerAssetGroup(address, candidate.groupId, candidate.relayChain);

        if (sameAssetGroup) sameAssetGroup.balances.push(...missingBalances);
        else this.balanceMap[address].push({ ...candidate, balances: missingBalances });
      });
    });
  }

  // Bitcoin, Iroha and Solana services keep one group per asset across networks (Bitcoin and Bitcoin Testnet both
  // hold BTC); restoring or seeding balances must not split those into duplicate groups.
  private findIndexerAssetGroup(address: string, groupId: string, relayChain?: string): TokenGroup | undefined {
    if (!['bitcoin', 'iroha', 'solana'].some((indexerChain) => isSameString(relayChain, indexerChain))) return undefined;

    return this.balanceMap[address]?.find(
      (group) => group.groupId === groupId && isSameString(group.relayChain, relayChain)
    );
  }

  getTokenBalance(address: string, assetId: string, relayChain?: string, networkKey?: string) {
    // The same registry id can live on several networks (DOT on Polkadot and Polkadot AssetHub,
    // DAI on Arbitrum One and OP Mainnet), so a known network selects that network's group first.
    const networkGroup = networkKey
      ? this.balanceMap[address].find(({ balances }) =>
          balances.some(({ id, name }) => id === assetId && isSameString(name, networkKey))
        )
      : undefined;

    if (networkGroup) return networkGroup;

    // TODO проверить будет ли корректно работать если заменить на поиск по groupId
    return this.balanceMap[address].find((tokenGroup) => {
      const existId = tokenGroup.balances.some(({ id }) => id === assetId);

      if (relayChain) return existId && isSameString(tokenGroup.relayChain, relayChain);

      return existId;
    })!;
  }

  public async fetchBalance({
    address,
    ethereumAddress,
    evmNetworks = [],
    substrateNetworks = [],
    tonNetworks = [],
    solanaNetworks = [],
    bitcoinNetworks = [],
    irohaNetworks = [],
    solanaAddress,
    bitcoinAddress,
    bitcoinTestnetAddress,
    irohaAddress,
    walletEcosystem,
  }: GetBalancesProps): Promise<ResponseBalanceRequest[]> {
    const account = this.state.keyringService?.getAllMainAccounts?.().find(({ address: accountAddress }) =>
      isSameString(accountAddress, address)
    );
    const publicAccounts = account?.meta.universalWallet?.publicAccounts ?? [];
    const ecosystems = new Set(publicAccounts.map(({ ecosystem }) => ecosystem));
    const isUniversal = ecosystems.size > 1;

    if (isUniversal) {
      this.ensureUniversalDefaultBalances(address, ecosystems);
      const publicAddress = (ecosystem: WalletEcosystem, chain?: string): string | undefined =>
        publicAccounts.find(
          (item) => item.ecosystem === ecosystem && (!chain || item.chainId?.toLowerCase().includes(chain))
        )?.address;
      const tasks: Promise<ResponseBalanceRequest[]>[] = [];

      if (ecosystems.has(WalletEcosystem.Substrate)) {
        tasks.push(this.substrateBalanceService.fetchBalance({
          address: publicAddress(WalletEcosystem.Substrate) ?? address,
          networks: substrateNetworks,
          ethereumAddress: ethereumAddress ?? publicAddress(WalletEcosystem.Evm),
        }));
      }
      if (ecosystems.has(WalletEcosystem.Evm)) {
        tasks.push(this.evmBalanceService.fetchBalance({
          networks: evmNetworks,
          ethereumAddress: ethereumAddress || publicAddress(WalletEcosystem.Evm),
        }));
      }
      if (ecosystems.has(WalletEcosystem.Ton)) {
        tasks.push(this.tonBalanceService.fetchBalance(address, tonNetworks));
      }
      if (ecosystems.has(WalletEcosystem.Solana)) {
        tasks.push(this.solanaBalanceService.fetchBalance({
          address,
          solanaAddress: solanaAddress ?? publicAddress(WalletEcosystem.Solana),
          networks: solanaNetworks,
        }));
      }
      if (ecosystems.has(WalletEcosystem.Bitcoin)) {
        tasks.push(this.bitcoinBalanceService.fetchBalance({
          address,
          bitcoinAddress: bitcoinAddress ?? publicAddress(WalletEcosystem.Bitcoin, 'mainnet'),
          bitcoinTestnetAddress: bitcoinTestnetAddress ?? publicAddress(WalletEcosystem.Bitcoin, 'testnet'),
          networks: bitcoinNetworks,
        }));
      }
      if (ecosystems.has(WalletEcosystem.Iroha)) {
        tasks.push(this.irohaBalanceService.fetchBalance({
          address,
          irohaAddress: irohaAddress ?? publicAddress(WalletEcosystem.Iroha, 'taira'),
          networks: irohaNetworks,
        }));
      }

      return (await Promise.all(tasks)).flat();
    }

    if (walletEcosystem === WalletEcosystem.Ton) return this.tonBalanceService.fetchBalance(address, tonNetworks);
    if (walletEcosystem === WalletEcosystem.Solana)
      return this.solanaBalanceService.fetchBalance({ address, solanaAddress, networks: solanaNetworks });
    if (walletEcosystem === WalletEcosystem.Bitcoin)
      return this.bitcoinBalanceService.fetchBalance({
        address,
        bitcoinAddress,
        bitcoinTestnetAddress,
        networks: bitcoinNetworks,
      });
    if (walletEcosystem === WalletEcosystem.Iroha)
      return this.irohaBalanceService.fetchBalance({ address, irohaAddress, networks: irohaNetworks });

    const evmBalances = await this.evmBalanceService.fetchBalance({ networks: evmNetworks, ethereumAddress });

    const substrateBalances = await this.substrateBalanceService.fetchBalance({
      address,
      networks: substrateNetworks,
      ethereumAddress,
    });

    return [...substrateBalances, ...evmBalances];
  }
}
