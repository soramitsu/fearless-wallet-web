import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { Subject } from 'rxjs';
import { PREP_NETWORKS_NAME } from '@extension-base/const/networks';
import { type GetBalancesProps } from '../subscription-service';
import { TonBalance } from '../ton-balance/TonBalance';
import SubstrateBalanceService from './SubstrateBalanceService';
import EvmBalanceService from './EvmBalanceService';
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

export default class BalanceService {
  substrateBalanceService: SubstrateBalanceService;
  evmBalanceService: EvmBalanceService;
  tonBalanceService: TonBalance;
  balanceMap: BalanceMap = {};
  balanceSubject = new Subject<BalanceJson>();

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
  }

  public updateBalanceStore(networkKey: string, item: Partial<BalanceItem>, address: string) {
    this.updateBalanceStorage(networkKey, address, item).catch((e) => console.warn(e));
  }

  private async updateBalanceStorage(chain: string, address: string, item: Partial<BalanceItem>) {
    if (item.state !== APIItemState.READY) return;

    const { balances } = await storage.get(['balances']);
    const copyBalance = { ...(balances ?? {}) };
    const { symbol } = item;

    if (!symbol) return;

    if (!copyBalance[address]) copyBalance[address] = {};

    if (item.state !== APIItemState.READY) return;

    if (!copyBalance[address][symbol]) copyBalance[address][symbol] = {};

    copyBalance[address][symbol][chain] = { chain, ...item } as BalanceItem;

    await storage.set({ balances: copyBalance });
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

    const assetIndex = this.balanceMap[accountAddress][groupIndex].balances.findIndex(({ name }) => {
      const key = PREP_NETWORKS_NAME[name] ?? name;

      return isSameString(key, networkKey);
    });

    this.balanceMap[accountAddress][groupIndex].balances[assetIndex] = {
      ...this.balanceMap[accountAddress][groupIndex].balances[assetIndex],
      reserved: item.reserved,
      free: item.free,
      locked: item.locked,
      frozen: item.frozen,
      total: item.total,
      transferable: item.transferable,
      state: item.state!,
      timestamp: +new Date(),
    };

    this.updateBalanceStore(networkKey, item, address);

    this.state.timeoutService.lazyNext('setBalanceItem', () => this.publishBalance(), 500);
  }

  public setJettonBalanceItem(networkKey: string, item: Partial<BalanceItem>, accountAddress: string) {
    const balance: BalanceItem = {
      address: accountAddress,
      icon: item.icon!,
      name: networkKey,
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
      tokenName: item.name!,
      relayChain: item.relayChain as RelayChainName,
      priceId: item.symbol,
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
        const totalBalances = Object.keys(this.balanceMap).map((address) => {
          const total = getSummaryTransferableWalletBalance(
            address,
            this.balanceMap[address],
            prices,
            ALL_NETWORKS,
            this.state.networkService.networksGithub
          );

          const change = getChangeWalletBalance(this.balanceMap[address], prices, ALL_NETWORKS);

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
