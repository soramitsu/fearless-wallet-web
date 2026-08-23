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
  ResponseTotalBalances,
  ResponseBalanceRequest,
  TokenGroup,
} from '@extension-base/background/types/types';
import { getMockAssets } from '@/extension/background/extension-base/src/background/helpers/assets';
import { isSameString, isTonNetwork } from '@/helpers';
import { type RelayChainName, WalletEcosystem, type NetworkName } from '@/interfaces';
import { buildPortfolioSummary, createAssetKey, getCanonicalAssetId } from '@/portfolio/assetIdentity';

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

      Object.entries(cached).forEach(([storedKey, item]) => {
        if (!item?.id || !item.chain || item.state !== APIItemState.READY) return;
        if (storedKey !== this.getStorageAssetKey(item.chain, item)) return;

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
          if (item.priceId) group.priceId = item.priceId;
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

    return this.enqueueBalanceStorageMutation(() =>
      this.updateBalanceStorage(networkKey, address, itemSnapshot)
    ).catch((e) => console.warn(e));
  }

  public deleteBalanceStore(
    networkKey: string,
    identity: Pick<BalanceItem, 'id'> & Partial<BalanceItem>,
    address: string
  ) {
    const identitySnapshot = { ...identity };
    return this.enqueueBalanceStorageMutation(() =>
      this.deleteBalanceStorage(networkKey, identitySnapshot, address)
    );
  }

  private enqueueBalanceStorageMutation(mutation: () => Promise<void>): Promise<void> {
    const pending = this.balanceStorageMutation.then(mutation);

    this.balanceStorageMutation = pending.catch(() => undefined);

    return pending;
  }

  private async deleteBalanceStorage(
    chain: string,
    identity: Pick<BalanceItem, 'id'> & Partial<BalanceItem>,
    address: string
  ) {
    const { assetBalances } = await storage.get(['assetBalances']);
    const copyAssetBalances = { ...(assetBalances ?? {}) };
    const canonicalForAccount = { ...(copyAssetBalances[address] ?? {}) };
    const canonicalKey = this.getStorageAssetKey(chain, identity);

    if (!canonicalForAccount[canonicalKey]) return;

    delete canonicalForAccount[canonicalKey];
    if (Object.keys(canonicalForAccount).length) copyAssetBalances[address] = canonicalForAccount;
    else delete copyAssetBalances[address];

    await storage.set({ assetBalances: copyAssetBalances });
  }

  private async updateBalanceStorage(chain: string, address: string, item: BalanceItem) {
    if (item.state !== APIItemState.READY && item.state !== APIItemState.ERROR) return;

    const { assetBalances, networkScanStates } = await storage.get(['assetBalances', 'networkScanStates']);
    const copyAssetBalances = { ...(assetBalances ?? {}) };
    const copyScanStates = { ...(networkScanStates ?? {}) };
    const accountScanStates = { ...(copyScanStates[address] ?? {}) };
    const previousScan = accountScanStates[chain];
    const now = Date.now();
    const coverage = item.scanCoverage ?? previousScan?.coverage ?? 'limited';

    accountScanStates[chain] = item.state === APIItemState.READY
      ? {
          lastAttempt: now,
          lastSuccess: item.timestamp ?? now,
          stale: false,
          coverage,
        }
      : {
          lastAttempt: now,
          lastSuccess: previousScan?.lastSuccess,
          stale: true,
          error: 'balance_scan_failed',
          coverage,
        };
    copyScanStates[address] = accountScanStates;
    this.networkScanStates[address] = accountScanStates;

    if (item.state === APIItemState.ERROR) {
      await storage.set({ networkScanStates: copyScanStates });
      return;
    }

    const canonicalKey = this.getStorageAssetKey(chain, item);
    copyAssetBalances[address] = {
      ...(copyAssetBalances[address] ?? {}),
      [canonicalKey]: { chain, ...item } as BalanceItem & { chain: NetworkName },
    };

    await storage.set({ assetBalances: copyAssetBalances, networkScanStates: copyScanStates });
  }

  private getStorageAssetKey(
    chain: string,
    item: Pick<BalanceItem, 'id'> & Partial<BalanceItem>
  ): string {
    const network = this.state.networkService?.networkValues?.find(({ name }) => isSameString(name, chain));
    const ecosystem = String(network?.ecosystem ?? item.relayChain ?? 'unknown');
    const chainId = String(network?.chainId ?? chain);
    const assetId = getCanonicalAssetId(item as BalanceItem);

    return createAssetKey({ ecosystem, chainId, assetId });
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

  async getTotalBalances(): Promise<ResponseTotalBalances[]> {
    return new Promise<ResponseTotalBalances[]>((res) =>
      this.state.pricesService.getPrice((prices) => {
        const registryNetworks = this.state.networkService.networksGithub?.length
          ? this.state.networkService.networksGithub
          : this.state.networkService.networkValues ?? [];
        const totalBalances = Object.keys(this.balanceMap).map((address) => {
          const summary = buildPortfolioSummary({
            groups: this.balanceMap[address],
            networks: registryNetworks,
            prices: prices.tokenPriceMap,
            priceChanges: prices.tokenPriceChange,
            addressForNetwork: () => address,
          });

          return {
            address,
            total: summary.total,
            change: { amount: summary.changeAmount, percent: summary.changePercent },
          };
        });

        res(totalBalances);
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

        if (missingBalances.length) this.balanceMap[address].push({ ...candidate, balances: missingBalances });
      });
    });
  }

  getTokenBalance(address: string, assetId: string, relayChain?: string) {
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
