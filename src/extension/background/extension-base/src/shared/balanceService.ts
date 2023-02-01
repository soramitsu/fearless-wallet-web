// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { APIItemState, BalanceChildItem, BalanceItem } from '../api/evm/types/ether';
import { storage } from '../stores/Storage';
import { TransactionHistoryItemType } from '../types';

export default class BalanceService {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('Balance-service');
  }

  // Balance
  async updateBalanceStore(chain: string, chainHash: string, address: string, item: BalanceItem) {
    if (item.state === APIItemState.READY) {
      this.logger.log(`Updating balance for [${chain}]`);
      const { balances } = await storage.get(['balances']);

      const balanceByAddress = balances[address] ?? {};
      if (item.children) this.updateChildren(item.children, chainHash, chain, address);

      return storage.set({
        balances: {
          ...balances,
          [address]: {
            ...balanceByAddress,
            [chain]: { chainHash, chain, address, ...item },
          },
        },
      });
    }
  }

  async updateChildren(children: Record<string, BalanceChildItem>, chainHash: string, chain: string, address: string) {
    const { balances } = await storage.get(['balances']);
    const balanceByAddress = balances[address] ?? {};
    Object.keys(children).forEach((token) => {
      balanceByAddress[token] = { ...children[token], chain, chainHash, address, state: APIItemState.READY };
    });
    storage.set({
      balances: {
        ...balances,
        [address]: {
          ...balanceByAddress,
        },
      },
    });
  }
  public async getBalanceObservable(address: string) {
    const { balances } = await chrome.storage.local.get(['balances']);

    return balances[address];
  }

  // Transaction history
  async addHistories(chain: string, chainHash: string, address: string, histories: TransactionHistoryItemType[]) {
    this.logger.log(`Updating transaction history for [${chain}]`);

    return chrome.storage.local.set(histories.map((item) => ({ chainHash, chain, address, eventIdx: 0, ...item })));
  }
}
