// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise } from '@polkadot/api';
import { ethers } from 'ethers';
import { ASTAR_REFRESH_BALANCE_INTERVAL, SUB_TOKEN_REFRESH_BALANCE_INTERVAL } from '../../const/intervals';
import { state } from '../../background/handlers';
import { getRegistry } from '../substrate/registry';
import { APIItemState, BalanceChildItem, BalanceItem, TokenInfo } from './types/ether';
import EthProvider from './ethProvider';
import { getERC20Contract } from './utils/eth';
import { AssetJson } from '@/interfaces';

export async function getEVMBalance(
  networkKey: string,
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>
): Promise<string[]> {
  const eth = web3ApiMap[networkKey];

  return await Promise.all(
    addresses.map(async (address) => {
      return await eth.getBalance(address);
    })
  );
}

function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: BalanceItem) => void
): () => void {
  let tokenList: AssetJson[] = [];
  const ERC20ContractMap = {} as Record<string, ethers.Contract>;

  const getTokenBalances = () => {
    tokenList.map(async ({ precision, symbol, displayName }) => {
      try {
        const name = displayName ?? symbol;
        const contract = ERC20ContractMap[symbol];
        const bals = await Promise.all(
          addresses.map((address): Promise<string> => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            return contract.balanceOf(address);
          })
        );

        const free = bals.map((bal) => ethers.utils.formatUnits(bal, precision));

        subCallback({
          state: APIItemState.READY,
          name,
          key: name,
          symbol,
          reserved: '0',
          frozen: '0',
          free: free.toString(),
        });
      } catch (err) {
        console.warn('There is problem when fetching ' + symbol + ' token balance', err);
      }
    });
  };

  getRegistry(networkKey, api)
    .then(({ tokenMap }) => {
      tokenList = tokenMap.filter(({ contractAddress }) => !!contractAddress);
      tokenList.forEach(({ contractAddress, symbol }) => {
        if (contractAddress) {
          ERC20ContractMap[symbol] = getERC20Contract(networkKey, contractAddress, web3ApiMap);
        }
      });
      getTokenBalances();
    })
    .catch(console.warn);

  const interval = setInterval(getTokenBalances, SUB_TOKEN_REFRESH_BALANCE_INTERVAL);

  return () => {
    clearInterval(interval);
  };
}

export function subscribeEVMBalance(
  networkKey: string,
  api: ApiPromise,
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  const balanceItem = {
    state: APIItemState.PENDING,
    free: '0',
    reserved: '0',
    miscFrozen: '0',
    frozen: '0',
  } as BalanceItem;

  function getBalance() {
    getEVMBalance(networkKey, addresses, web3ApiMap)
      .then((balances) => {
        balanceItem.free = balances.map((bal) => ethers.utils.formatUnits(bal)).toString();
        balanceItem.state = APIItemState.READY;
        callback(networkKey, balanceItem);
      })
      .catch(console.warn);
  }

  function subCallback(item: BalanceItem) {
    callback(networkKey, item);
  }

  getBalance();
  const interval = setInterval(getBalance, ASTAR_REFRESH_BALANCE_INTERVAL);
  const unsub2 = subscribeERC20Interval(addresses, networkKey, api, web3ApiMap, subCallback);

  return () => {
    clearInterval(interval);
    unsub2 && unsub2();
  };
}
