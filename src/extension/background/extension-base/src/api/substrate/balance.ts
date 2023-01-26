// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { Contract } from 'ethers';

import {
  SUB_TOKEN_REFRESH_BALANCE_INTERVAL,
  ASTAR_REFRESH_BALANCE_INTERVAL,
  SUBSCRIBE_BALANCE_FAST_INTERVAL,
} from '../../const/intervals';
import { categoryAddresses } from '../../utils';
import { getEVMBalance } from '../evm/balance';
import EthProvider from '../evm/ethProvider';
import { APIItemState, BalanceChildItem, BalanceItem, TokenInfo } from '../evm/types/ether';
import { sumBN, getERC20Contract } from '../evm/utils/eth';
import { getRegistry } from '../evm/utils/registery';

type EqBalanceItem = [number, { positive: number }];

function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: Record<string, BalanceChildItem>) => void
): () => void {
  let tokenList = {} as TokenInfo[];
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    Object.values(tokenList).map(async ({ decimals, symbol }) => {
      let free = new BN(0);

      try {
        const contract = ERC20ContractMap[symbol];
        const bals = await Promise.all(
          addresses.map((address): Promise<string> => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            return contract.methods.balanceOf(address).call();
          })
        );

        free = sumBN(bals.map((bal) => new BN(bal || 0)));
        // console.log('TokenBals', symbol, addresses, bals, free);

        subCallback({
          [symbol]: {
            reserved: '0',
            frozen: '0',
            free: free.toString(),
            decimals,
          },
        });
      } catch (err) {
        console.info('There is problem when fetching ' + symbol + ' token balance', err);
      }
    });
  };

  getRegistry(networkKey, api, getActiveErc20Tokens())
    .then(({ tokenMap }) => {
      tokenList = Object.values(tokenMap).filter(({ contractAddress }) => !!contractAddress);
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
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  const balanceItem = {
    state: APIItemState.PENDING,
    free: '0',
    reserved: '0',
    miscFrozen: '0',
    feeFrozen: '0',
  } as BalanceItem;

  function getBalance() {
    getEVMBalance(networkKey, addresses, web3ApiMap)
      .then((balances) => {
        balanceItem.free = sumBN(balances.map((b) => new BN(b || '0'))).toString();
        balanceItem.state = APIItemState.READY;
        callback(networkKey, balanceItem);
      })
      .catch(console.warn);
  }

  function subCallback(children: Record<string, BalanceChildItem>) {
    if (!Object.keys(children).length) {
      return;
    }

    balanceItem.children = { ...balanceItem.children, ...children };
    callback(networkKey, balanceItem);
  }

  getBalance();
  const interval = setInterval(getBalance, ASTAR_REFRESH_BALANCE_INTERVAL);
  // const unsub2 = subscribeERC20Interval(addresses, networkKey, api, web3ApiMap, subCallback);

  return () => {
    clearInterval(interval);
    // unsub2 && unsub2();
  };
}

export function subscribeBalance(
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  const [evmAddresses] = categoryAddresses(addresses);

  const unsubList = Object.entries(web3ApiMap).map(async ([networkKey, apiProps]) => {
    const useAddresses = evmAddresses;

    if (['ethereum', 'ethereum_goerli'].includes(networkKey)) {
      return subscribeEVMBalance(networkKey, useAddresses, web3ApiMap, callback);
    }
  });

  return () => {
    unsubList.forEach((subProm) => {
      subProm
        .then((unsub) => {
          unsub && unsub();
        })
        .catch(console.error);
    });
  };
}

export async function getFreeBalance(
  networkKey: string,
  address: string,
  web3ApiMap: Record<string, EthProvider>,
  token?: string
): Promise<string> {
  const web3Api = web3ApiMap[networkKey];

  // web3Api support mean isEthereum Network support

  return (await web3Api.getBalance(address)) || '0';
}

export async function subscribeFreeBalance(
  networkKey: string,
  address: string,
  web3ApiMap: Record<string, EthProvider>,
  token: string | undefined,
  update: (balance: string) => void
): Promise<() => void> {
  const web3Api = web3ApiMap[networkKey];

  // Only EVM Address use with EVM network
  if (Boolean(web3Api) !== isEthereumAddress(address)) {
    if (!isEthereumAddress(address)) {
      update('0');

      return () => undefined;
    }
  }

  const responseIntervalSubscription = (method: () => void) => {
    method();
    const interval = setInterval(method, SUBSCRIBE_BALANCE_FAST_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  };

  // web3Api support mean isEthereum Network support
  if (web3Api) {
    const getEvmMainBalance = () => {
      web3Api.getBalance(address).then(update).catch(console.info);
    };

    return responseIntervalSubscription(getEvmMainBalance);
  }

  return () => undefined;
}
