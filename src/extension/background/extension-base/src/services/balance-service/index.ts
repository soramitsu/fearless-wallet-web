import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { Subject } from 'rxjs';
import { type FPNumber } from '@sora-substrate/util';
import { getMockCurrencies } from '@extension-base/background/handlers/helpers';
import { PREP_NETWORKS_NAME } from '@extension-base/const/networks';
import { fetchBalance } from '@extension-base/api/substrate/balance';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { BalanceMap, BalanceJson, ResponseTotalBalances } from '@extension-base/background/types/types';
import { SORA_XOR_ASSET_ID, SORA_NETWORK_NAME } from '@/consts/sora';
import { isSameString } from '@/helpers';
import { ALL_NETWORKS } from '@/consts/networks';
import { getSummaryTransferableWalletBalance, getChangeWalletBalance } from '@/helpers/common';
import { type NetworkName } from '@/interfaces';

export default class BalanceService {
  public balanceMap: BalanceMap = {};
  public balanceSubject = new Subject<BalanceJson>();

  constructor(private state: State) {}

  getAccountBalance(address: string) {
    return this.balanceMap[address];
  }

  deleteBalance(address: string) {
    if (!this.balanceMap[address]) return;

    delete this.balanceMap[address];
  }

  public updateBalanceStore(networkKey: string, item: Partial<BalanceItem>) {
    const currentAccount = this.state.currentAccount;

    if (currentAccount)
      this.updateBalanceStorage(networkKey, currentAccount.address, item).catch((e) => console.warn(e));
  }

  // Balance
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

  updateBalance(balance: BalanceJson) {
    return this.balanceSubject.next(balance);
  }

  public async updateXorTotalBalance(muchTotal: FPNumber): Promise<void> {
    const address = this.state.getAccountAddress();

    if (!address) return;

    const currencyIndex = this.balanceMap[address].findIndex(({ groupId }) => groupId === SORA_XOR_ASSET_ID);

    const token = this.balanceMap[address][currencyIndex];
    const index = token.balances.findIndex(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

    this.balanceMap[address][currencyIndex].balances[index].muchTotal = muchTotal.toString();
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
        balances.find(({ isUtility, name }) => isUtility && name.toLowerCase() === networkName.toLowerCase())
      );

      const token = this.balanceMap[address][currencyIndex];
      const index = token.balances.findIndex(({ name }) => name.toLowerCase() === networkName.toLowerCase());

      this.balanceMap[address][currencyIndex].balances[index].existentialDeposit =
        existentialDeposit?.toString() ?? '0';
    });
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const { reserved, free, locked, frozen, total, transferable, state, id, relayChain, symbol } = item;
    const accountAddress = this.state.keyringService.getSubstrateAddress(address);
    const balancesByAddress = this.balanceMap[accountAddress];

    const currencyIndex = balancesByAddress.findIndex(({ groupId, symbol: _symbol, relayChain: _relayChain }) => {
      const isExistingAssetId = groupId === id;
      const isExistingDisplayName = _symbol === symbol;
      const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

      return isExistingAssetId || isExistingAsset;
    });

    if (currencyIndex === -1) throw new Error(`Failed to find ${symbol} on ${networkKey}`);

    const asset = balancesByAddress[currencyIndex];

    const assetIndex = asset.balances.findIndex(({ name }) => {
      const key = PREP_NETWORKS_NAME[name] ?? name;

      return isSameString(key, networkKey);
    });

    const balanceItem = asset.balances[assetIndex];

    asset.balances[assetIndex] = {
      ...balanceItem,
      reserved,
      free,
      locked,
      frozen,
      total,
      transferable,
      state: state!,
      timestamp: +new Date(),
    };

    this.updateBalanceStore(networkKey, item);

    this.state.lazyNext('setBalanceItem', () => this.publishBalance());
  }

  public async publishBalance() {
    const balance = await this.getBalance();

    return this.updateBalance(balance);
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

  public generateDefaultBalance(address: string) {
    if (address === '') return;

    if (this.balanceMap?.[address] === undefined) this.balanceMap[address] = getMockCurrencies(this.state.networkMap);
  }

  getTokenBalance(address: string, assetId: string, relayChain?: string) {
    // TODO проверить будет ли корректно работать если заменить на поиск по groupId
    return this.balanceMap[address].find((tokenGroup) => {
      const existId = tokenGroup.balances.some(({ id }) => id === assetId);

      if (relayChain) return existId && isSameString(tokenGroup.relayChain, relayChain);

      return existId;
    })!;
  }

  public async fetchBalance(address: string, networkName: NetworkName) {
    const api = this.state.getSubstrateApiMap[networkName.toLowerCase()]?.api;

    return await fetchBalance(address, networkName, this.state, api);
  }
}
