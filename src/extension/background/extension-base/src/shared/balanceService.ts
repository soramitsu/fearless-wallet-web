import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import { APIItemState } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';

export default class BalanceService {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('Balance-service');
  }

  // Balance
  async updateBalanceStore(chain: string, address: string, item: Partial<BalanceItem>) {
    if (item.state !== APIItemState.READY) return;

    const { balances } = await storage.get(['balances']);
    const copyBalance = { ...(balances ?? {}) };
    const { symbol } = item;

    if (!symbol) return;

    if (copyBalance[address]) copyBalance[address] = {};
    if (item.state !== APIItemState.READY) return;

    if (!symbol) return;

    if (copyBalance[address]) copyBalance[address] = {};

    if (copyBalance[address][symbol]) copyBalance[address][symbol] = {};

    copyBalance[address][symbol][chain] = { chain, ...item } as BalanceItem;

    await storage.set({ balances: copyBalance });
  }
}
