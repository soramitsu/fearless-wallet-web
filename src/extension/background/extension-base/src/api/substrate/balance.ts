// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { assetFromToken } from '@equilab/api';
import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { Contract, ethers } from 'ethers';
import { state } from '../../background/handlers';
import { categoryAddresses } from '../../background/handlers/helpers';
import { ApiProps, TokenBalanceRaw } from '../../background/types';

import {
  SUB_TOKEN_REFRESH_BALANCE_INTERVAL,
  ASTAR_REFRESH_BALANCE_INTERVAL,
  SUBSCRIBE_BALANCE_FAST_INTERVAL,
} from '../../const/intervals';
import { getEVMBalance } from '../evm/balance';
import EthProvider from '../evm/ethProvider';
import { APIItemState, BalanceChildItem, BalanceItem, TokenInfo } from '../evm/types/ether';
import { getERC20Contract } from '../evm/utils/eth';
import { getRegistry, getTokenInfo } from '../evm/utils/registery';

type EqBalanceItem = [number, { positive: number }];

export function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: Record<string, BalanceChildItem>) => void
): () => void {
  let tokenList = {} as TokenInfo[];
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    Object.values(tokenList).map(async ({ decimals, symbol }) => {
      try {
        const contract = ERC20ContractMap[symbol];
        const bals: ethers.BigNumberish[] = await Promise.all(
          addresses.map((address): Promise<ethers.BigNumberish> => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access

            return contract.balanceOf(address);
          })
        );
        const free = bals.map((bal) => ethers.utils.formatUnits(bal, decimals));

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

  const api: ApiPromise = {} as ApiPromise;
  getRegistry(networkKey, api, state.getActiveErc20Tokens())
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
        balanceItem.free = balances.toString();
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
  const unsub2 = subscribeERC20Interval(addresses, networkKey, web3ApiMap, subCallback);

  return () => {
    clearInterval(interval);
    unsub2 && unsub2();
  };
}

export function subscribeBalance(
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  const [substrateAdresses, evmAddresses] = categoryAddresses(addresses);
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
  dotSamaApiMap: Record<string, ApiProps>,
  web3ApiMap: Record<string, EthProvider>,
  token?: string
): Promise<string> {
  const apiProps = await dotSamaApiMap[networkKey].isReady;
  const api = apiProps.api;
  const web3Api = web3ApiMap[networkKey];
  const tokenInfo = token ? await getTokenInfo(networkKey, api, token) : undefined;
  const isMainToken = tokenInfo ? tokenInfo.isMainToken : true;

  // Only EVM Address use with EVM network
  if (Boolean(web3Api || apiProps.isEthereum) !== isEthereumAddress(address)) {
    if (!isEthereumAddress(address)) {
      return '0';
    }
  }

  // web3Api support mean isEthereum Network support
  if (web3Api) {
    if (isMainToken) {
      return (await web3Api?.getBalance(address)) || '0';
    } else {
      if (!tokenInfo?.contractAddress) {
        return '0';
      }

      const contract = getERC20Contract(networkKey, tokenInfo.contractAddress, web3ApiMap);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      const free = await contract.methods.balanceOf(address).call();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
      return free?.toString() || '0';
    }
  } else {
    if (token) {
      if (['genshiro_testnet', 'genshiro'].includes(networkKey)) {
        const asset = assetFromToken(token);
        const balance = await api.query.eqBalances.account(address, asset);

        // eslint-disable-next-line
        // @ts-ignore
        return balance.asPositive?.toString() || '0';
      } else if (['equilibrium_parachain'].includes(networkKey)) {
        const balance = (await api.query.system.account(address)) as any;

        const balancesData = JSON.parse(balance.data.toString()) as EqBalanceItem[];
        let freeTokenBalance: EqBalanceItem | undefined;

        if (tokenInfo && tokenInfo.specialOption) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          freeTokenBalance = balancesData.find((data: EqBalanceItem) => data[0] === tokenInfo.specialOption?.assetId);
        } else {
          freeTokenBalance = balancesData[0];
        }

        return freeTokenBalance ? freeTokenBalance[1].positive.toString() : '0';
      } else if (
        tokenInfo &&
        ((networkKey === 'crab' && tokenInfo.symbol === 'CKTON') ||
          (networkKey === 'pangolin' && tokenInfo.symbol === 'PKTON'))
      ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const balance = (await api.query.system.account(address)) as { data: { freeKton: Balance } };

        return balance.data?.freeKton?.toString() || '0';
      } else if (!isMainToken && ['astar', 'shiden', 'statemint', 'statemine'].includes(networkKey)) {
        const balanceInfo = (await api.query.assets.account(tokenInfo?.assetIndex, address)).toHuman() as Record<
          string,
          string
        >;

        return balanceInfo?.balance?.replaceAll(',', '') || '0';
      } else if (!isMainToken || ['kintsugi', 'kintsugi_test', 'interlay'].includes(networkKey)) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const balance = (await api.query.tokens.accounts(
          address,
          tokenInfo?.specialOption || { Token: token }
        )) as TokenBalanceRaw;

        return balance.free?.toString() || '0';
      }
    }

    if (
      ['kusama', 'kintsugi', 'kintsugi_test', 'interlay', 'acala', 'statemint', 'karura', 'bifrost'].includes(
        networkKey
      )
    ) {
      const _balance = await api.query.system.account(address);

      const balance = _balance.toHuman();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const freeBalance = new BN(balance.data?.free.replaceAll(',', ''));
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const miscFrozen = new BN(balance.data?.miscFrozen.replaceAll(',', ''));

      const transferable = freeBalance.sub(miscFrozen);

      return transferable.toString() || '0';
    }

    const balance = await api.derive.balances.all(address);

    return balance.availableBalance?.toBn()?.toString() || '0';
  }
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
