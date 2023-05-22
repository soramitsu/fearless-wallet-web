import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { APIItemState, BalanceItem } from '../api/evm/types/ether';
import { storage } from '../stores/Storage';
import { TransactionHistoryItemType } from '../types';

export default class BalanceService {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('Balance-service');
  }

  // Balance
  async updateBalanceStore(chain: string, address: string, item: BalanceItem) {
    if (item.state === APIItemState.READY) {
      const { balances } = await storage.get(['balances']);
      const copyBalance = { ...(balances ?? {}) };

      if (!copyBalance[address]) copyBalance[address] = {};
      if (!copyBalance[address][item.name]) copyBalance[address][item.name] = {};

      copyBalance[address][item.name][chain] = { chain, ...item };

      await storage.set({ balances: copyBalance });
    }
  }

  // Transaction history
  async addHistories(chain: string, chainHash: string, address: string, histories: TransactionHistoryItemType[]) {
    this.logger.log(`Updating transaction history for [${chain}]`);

    return chrome.storage.local.set(histories.map((item) => ({ chainHash, chain, address, eventIdx: 0, ...item })));
  }
}
