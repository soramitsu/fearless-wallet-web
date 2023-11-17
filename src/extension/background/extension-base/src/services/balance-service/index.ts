import { logger as createLogger } from '@polkadot/util';
import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { Subject } from 'rxjs';
import { type FPNumber } from '@sora-substrate/util';
import { getMockCurrencies, getSubstrateAddress } from '@extension-base/background/utils/utils';
import { PREP_NETWORKS_NAME } from '@extension-base/const/networks';
import { fetchBalance } from '../../api/substrate/balance';
import type { Logger } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { BalanceMap, BalanceJson, ResponseTotalBalances } from '@extension-base/background/types/types';
import { SORA_XOR_ASSET_ID, SORA_NETWORK_NAME } from '@/consts/sora';
import { isSameString } from '@/helpers';
import { ALL_NETWORKS } from '@/consts/networks';
import { getSummaryTransferableWalletBalance, getChangeWalletBalance } from '@/helpers/common';
import { type NetworkName } from '@/interfaces';

export default class BalanceService {
  private logger: Logger;
  private balanceMap: BalanceMap = {};
  public balanceSubject = new Subject<BalanceJson>();
  private state: State;

  constructor(state: State) {
    this.state = state;
    this.logger = this.logger = createLogger('Balance-service');
  }

  getAccountBalance(address: string) {
    return this.balanceMap[address];
  }

  deleteBalance(address: string) {
    if (!this.balanceMap[address]) return;

    delete this.balanceMap[address];
  }

  public updateBalanceStore(networkKey: string, item: Partial<BalanceItem>) {
    this.state.getCurrentAccount((currentAccountInfo) => {
      if (currentAccountInfo)
        this.updateBalanceStorage(networkKey, currentAccountInfo.address, item).catch((e) => console.warn(e));
    });
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
    const currentAccount = await this.state.currentAccount;

    if (!currentAccount) return;

    const { address } = currentAccount;

    const currencyIndex = this.balanceMap[address].findIndex(({ assetId }) => assetId === SORA_XOR_ASSET_ID);

    const token = this.balanceMap[address][currencyIndex];
    const index = token.balances.findIndex(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

    this.balanceMap[address][currencyIndex].balances[index].muchTotal = muchTotal.toString();
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const { reserved, free, locked, frozen, total, transferable, state, id, relayChain, symbol } = item;
    const accountAddress = getSubstrateAddress(address, this.state);
    const balancesByAddress = this.balanceMap[accountAddress];

    const currencyIndex = balancesByAddress.findIndex(
      ({ assetId: _assetId, symbol: _symbol, relayChain: _relayChain }) => {
        const isExistingAssetId = _assetId === id;
        const isExistingDisplayName = _symbol === symbol;
        const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

        return isExistingAssetId || isExistingAsset;
      }
    );

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

    this.state.lazyNext('setBalanceItem', () => this.state.publishBalance());
  }

  async getTotalBalances(): Promise<ResponseTotalBalances[]> {
    return new Promise<ResponseTotalBalances[]>((res) =>
      this.state.pricesService.getPrice((prices) => {
        const balances: BalanceMap = { ...this.balanceMap };

        const totalBalances = Object.keys(balances).map((address) => {
          const total = getSummaryTransferableWalletBalance(
            address,
            balances[address],
            prices,
            ALL_NETWORKS,
            this.state.networksJson
          );

          const change = getChangeWalletBalance(balances[address], prices, ALL_NETWORKS);

          return {
            address,
            total,
            change,
          };
        });

        res(totalBalances);
      })
    );
  }

  public async getBalance(): Promise<BalanceJson> {
    const account = await this.state.currentAccount;

    if (account) {
      return new Promise((resolve) => {
        resolve({ details: this.balanceMap[account.address] ?? [] });
      });
    }

    return { details: [] };
  }

  public generateDefaultBalance(address: string) {
    if (address === '') return;

    if (this.balanceMap?.[address] === undefined) this.balanceMap[address] = getMockCurrencies(this.state.networksJson);
  }

  getTokenBalance(address: string, assetId: string, relayChain?: string) {
    // TODO проверить будет ли корерктно работать если заменить на поиск по groupId
    return this.balanceMap[address].find(
      (balance) =>
        balance.balances.some(({ id }) => id === assetId) &&
        balance.relayChain?.toLowerCase() === relayChain?.toLowerCase()
    )!;
  }

  public async fetchBalance(address: string, networkName: NetworkName) {
    const api = this.state.getSubstrateApiMap[networkName.toLowerCase()]?.api;

    return await fetchBalance(address, networkName, this.state, api);
  }
}
