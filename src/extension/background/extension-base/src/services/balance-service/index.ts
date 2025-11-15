import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { Subject } from 'rxjs';
import { PREP_NETWORKS_NAME } from '@extension-base/const/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import { type GetBalancesProps } from '../subscription-service';
import { TonBalance } from '../ton-balance/TonBalance';
import SubstrateBalanceService from './SubstrateBalanceService';
import EvmBalanceService from './EvmBalanceService';
import BalanceLookupRegistry from './BalanceLookupRegistry';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type {
  BalanceMap,
  BalanceJson,
  ResponseTotalBalances,
  ResponseBalanceRequest,
  TokenGroup,
} from '@extension-base/background/types/types';
import { getMockAssets } from '@/extension/background/extension-base/src/background/helpers/assets';
import { isSameString, isTonNetwork } from '@/helpers';
import { ALL_NETWORKS } from '@/consts/networks';
import { getSummaryTransferableWalletBalance, getChangeWalletBalance } from '@/helpers/common';
import { type RelayChainName, WalletEcosystem, type NetworkName } from '@/interfaces';

type PendingStorageUpdates = Record<string, Record<string, Record<string, BalanceItem>>>;

export default class BalanceService {
  substrateBalanceService: SubstrateBalanceService;
  evmBalanceService: EvmBalanceService;
  tonBalanceService: TonBalance;
  balanceMap: BalanceMap = {};
  balanceSubject = new Subject<BalanceJson>();
  readonly lookupRegistry = new BalanceLookupRegistry();
  private pendingStorageUpdates: PendingStorageUpdates = {};
  private static readonly BALANCE_SYNC_TIMEOUT_KEY = 'balance:sync';

  constructor(private state: State) {
    this.substrateBalanceService = new SubstrateBalanceService(state);
    this.evmBalanceService = new EvmBalanceService(state);
    this.tonBalanceService = new TonBalance(state);
  }

  getAccountBalance(address: string) {
    return this.balanceMap[address];
  }

  deleteBalance(address: string) {
    if (!this.balanceMap[address]) return;

    delete this.balanceMap[address];

    (Object.values(WalletEcosystem) as WalletEcosystem[]).forEach((ecosystem) =>
      this.lookupRegistry.clearFetchCache(ecosystem, undefined, address)
    );

    const accountMeta = this.state.keyringService.getAccount(address, WalletEcosystem.Substrate)?.meta as
      | { ethereumAddress?: string }
      | undefined;

    if (accountMeta?.ethereumAddress) {
      this.lookupRegistry.clearFetchCache(WalletEcosystem.Evm, undefined, accountMeta.ethereumAddress);
    }
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
        balances.find((balance) => balance.isUtility && isSameString(getBalanceNetworkName(balance), networkName))
      );

      const token = this.balanceMap[address][currencyIndex];
      const index = token.balances.findIndex((balance) => isSameString(getBalanceNetworkName(balance), networkName));

      this.balanceMap[address][currencyIndex].balances[index].existentialDeposit =
        existentialDeposit?.toString() ?? '0';
    });
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const isAccountExists = this.state.keyringService.getAllMainAccounts().some((el) => el.address === address);

    if (!isAccountExists) return;

    const accountAddress = this.state.keyringService.getSubstrateAddress(address);

    const groupIndex = this.balanceMap[accountAddress].findIndex(({ groupId, symbol, relayChain }) => {
      const isExistingAssetId = groupId === item.id;
      const isExistingDisplayName = symbol === item.symbol;
      const isExistingAsset = isExistingDisplayName && relayChain === item.relayChain;

      return isExistingAssetId || isExistingAsset;
    });

    if (groupIndex === -1) {
      if (isTonNetwork(networkKey)) {
        this.setJettonBalanceItem(networkKey, item, accountAddress);

        return;
      } else throw new Error(`Failed to find ${item.symbol} on ${networkKey}`);
    }

    const assetIndex = this.balanceMap[accountAddress][groupIndex].balances.findIndex((balance) => {
      const balanceNetwork = getBalanceNetworkName(balance);
      const key = PREP_NETWORKS_NAME[balanceNetwork] ?? balanceNetwork;

      return isSameString(key, networkKey);
    });

    const currentBalance = this.balanceMap[accountAddress][groupIndex].balances[assetIndex];
    const resolvedNetworkName = getBalanceNetworkName(currentBalance) || networkKey;

    const updatedBalance: BalanceItem = {
      ...currentBalance,
      networkName: resolvedNetworkName,
      reserved: item.reserved,
      free: item.free,
      locked: item.locked,
      frozen: item.frozen,
      total: item.total,
      transferable: item.transferable,
      state: item.state!,
      timestamp: +new Date(),
    };

    this.balanceMap[accountAddress][groupIndex].balances[assetIndex] = updatedBalance;

    if (updatedBalance.state === APIItemState.READY) {
      this.queueStorageUpdate(accountAddress, updatedBalance, networkKey);
    }

    this.scheduleBalanceSync();
  }

  public setJettonBalanceItem(networkKey: string, item: Partial<BalanceItem>, accountAddress: string) {
    const tokenDisplayName = (item as { tokenName?: string }).tokenName ?? item.symbol ?? networkKey;

    const balance: BalanceItem = {
      address: accountAddress,
      icon: item.icon!,
      networkName: item.networkName ?? networkKey,
      precision: item.precision!,
      state: APIItemState.READY,
      total: item.total,
      transferable: item.transferable,
      reserved: '0',
      frozen: '0',
      locked: '0',
      mainNetwork: networkKey,
      symbol: item.symbol!,
      type: 'jetton',
      id: item.id!,
      walletAddress: item.walletAddress,
    };

    const asset: TokenGroup = {
      icon: item.assetIcon!,
      groupId: item.id!,
      mainNetwork: networkKey,
      providers: [],
      symbol: item.symbol!,
      tokenName: tokenDisplayName,
      relayChain: item.relayChain as RelayChainName,
      priceId: item.symbol,
      balances: [balance],
    };

    this.balanceMap[accountAddress].push(asset);

    if (balance.state === APIItemState.READY) {
      this.queueStorageUpdate(accountAddress, balance, networkKey);
    }

    this.scheduleBalanceSync();
  }

  private queueStorageUpdate(address: string, balance: BalanceItem, networkKey: string) {
    const { symbol } = balance;

    if (!symbol) return;

    const legacyName = (balance as BalanceItem & { name?: string }).name;
    const networkName = balance.networkName ?? legacyName ?? networkKey;
    const payload: BalanceItem = {
      ...balance,
      networkName,
      chain: networkKey,
    };

    if (!this.pendingStorageUpdates[address]) this.pendingStorageUpdates[address] = {};
    if (!this.pendingStorageUpdates[address][symbol]) this.pendingStorageUpdates[address][symbol] = {};

    this.pendingStorageUpdates[address][symbol][networkKey] = payload;
  }

  private scheduleBalanceSync() {
    this.state.timeoutService.lazyNext(
      BalanceService.BALANCE_SYNC_TIMEOUT_KEY,
      () => {
        void this.flushStorageUpdates()
          .then(() => this.publishBalance())
          .catch((error) => {
            console.warn('[BalanceService] Failed to sync balances', error);

            if (this.hasPendingStorageUpdates()) {
              this.scheduleBalanceSync();
            }
          });
      },
      500
    );
  }

  private hasPendingStorageUpdates(): boolean {
    return Object.keys(this.pendingStorageUpdates).length > 0;
  }

  private mergePendingStorageUpdates(updates: PendingStorageUpdates) {
    Object.entries(updates).forEach(([address, symbols]) => {
      if (!this.pendingStorageUpdates[address]) {
        this.pendingStorageUpdates[address] = {};
      }

      Object.entries(symbols).forEach(([symbol, networks]) => {
        if (!this.pendingStorageUpdates[address][symbol]) {
          this.pendingStorageUpdates[address][symbol] = {};
        }

        Object.assign(this.pendingStorageUpdates[address][symbol], networks);
      });
    });
  }

  private async flushStorageUpdates(): Promise<void> {
    if (!this.hasPendingStorageUpdates()) return;

    const updates = this.pendingStorageUpdates;
    this.pendingStorageUpdates = {};

    try {
      const { balances } = await storage.get(['balances']);
      const copyBalance = { ...(balances ?? {}) };

      Object.entries(updates).forEach(([address, symbols]) => {
        if (!copyBalance[address]) copyBalance[address] = {};

        Object.entries(symbols).forEach(([symbol, networks]) => {
          if (!copyBalance[address][symbol]) copyBalance[address][symbol] = {};

          Object.entries(networks).forEach(([networkKey, balance]) => {
            copyBalance[address][symbol][networkKey] = balance;
          });
        });
      });

      await storage.set({ balances: copyBalance });
    } catch (error) {
      this.mergePendingStorageUpdates(updates);
      throw error;
    }
  }

  public async publishBalance() {
    const balance = await this.getBalance();

    return this.balanceSubject.next(balance);
  }

  async getTotalBalances(): Promise<ResponseTotalBalances[]> {
    return new Promise<ResponseTotalBalances[]>((res) =>
      this.state.pricesService.getPrice((prices) => {
        const totalBalances = Object.keys(this.balanceMap).map((address) => {
          const total = getSummaryTransferableWalletBalance(
            address,
            this.balanceMap[address],
            prices,
            ALL_NETWORKS,
            this.state.networkService.networksGithub
          );

          const change = getChangeWalletBalance(this.balanceMap[address], prices, ALL_NETWORKS, {
            networks: this.state.networkService.networksGithub,
            favoriteAddress: address,
          });

          return { address, total, change };
        });

        res(totalBalances);
      })
    );
  }

  public async getBalance(): Promise<BalanceJson> {
    const account = this.state.currentAccount;

    if (account) {
      return new Promise((resolve) => {
        resolve({ details: this.balanceMap[account.address] ?? [] });
      });
    }

    return { details: [] };
  }

  public generateDefaultBalance(address: string, walletEcosystem: WalletEcosystem) {
    if (address === '') return;

    if (this.balanceMap?.[address] === undefined)
      this.balanceMap[address] = getMockAssets(this.state.networkService.networkMap, walletEcosystem);
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
    walletEcosystem,
  }: GetBalancesProps): Promise<ResponseBalanceRequest[]> {
    if (walletEcosystem === WalletEcosystem.Ton) return this.tonBalanceService.fetchBalance(address, tonNetworks);

    const evmBalances = await this.evmBalanceService.fetchBalance({ networks: evmNetworks, ethereumAddress });

    const substrateBalances = await this.substrateBalanceService.fetchBalance({
      address,
      networks: substrateNetworks,
      ethereumAddress,
    });

    return [...substrateBalances, ...evmBalances];
  }
}
