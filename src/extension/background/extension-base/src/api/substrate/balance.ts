// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { Contract } from 'ethers';
import { state } from '../../background/handlers';
import { ApiProps } from '../../background/types/types';
import { SUB_TOKEN_REFRESH_BALANCE_INTERVAL, ASTAR_REFRESH_BALANCE_INTERVAL } from '../../const/intervals';
import { sumBN } from '../../utils';
import { getEVMBalance } from '../evm/balance';
import EthProvider from '../evm/ethProvider';
import { APIItemState, BalanceItem } from '../evm/types/ether';
import { getERC20Contract } from '../evm/utils/eth';
import { isEthereumNetwork } from '../../background/utils/utils';
import { getRegistry, getTokenInfo } from './registry';
import { getAssetOptions } from './utils';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { AssetJson, RelayChainName } from '@/interfaces';
import { formatBalance } from '@/util/balances';

function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: BalanceItem) => void
): () => void {
  let tokenList: AssetJson[] = [];
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    tokenList.map(async ({ symbol, displayName }) => {
      let free = new BN(0);
      const name = displayName ?? symbol;

      try {
        const contract = ERC20ContractMap[symbol];
        const bals = await Promise.all(
          addresses.map((address): Promise<string> => {
            return contract.methods.balanceOf(address).call();
          })
        );

        free = sumBN(bals.map((bal) => new BN(bal || 0)));

        subCallback({
          state: APIItemState.READY,
          name,
          key: networkKey,
          symbol,
          reserved: '0',
          frozen: '0',
          free: free.toString(),
          chain: networkKey,
        });
      } catch (err) {
        console.info('There is problem when fetching ' + symbol + ' token balance', err);
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
        balanceItem.free = balances.toString();
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
  const unsub = subscribeERC20Interval(addresses, networkKey, api, web3ApiMap, subCallback);

  return () => {
    clearInterval(interval);
    unsub && unsub();
  };
}

export function checkMainToken(networkKey: string, id: string): boolean {
  if (id === undefined) return false;

  return state.networkMap[networkKey].assets.find((asset) => asset.assetId === id)?.isUtility ?? false;
}

export async function getFreeBalance(
  networkKey: string,
  address: string,
  dotSamaApiMap: Record<string, ApiProps>,
  web3ApiMap: Record<string, EthProvider>,
  token?: string
): Promise<string> {
  const apiProps = dotSamaApiMap[networkKey];
  await apiProps.isApiReady;
  const api = apiProps.api!;
  const web3Api = web3ApiMap[networkKey];
  const tokenInfo = token ? getTokenInfo(token) : undefined;

  const isMainToken = tokenInfo ? await checkMainToken(networkKey, tokenInfo?.id) : false;
  console.info(isMainToken, token, web3Api, 'isMain');

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

      const free = await contract.methods.balanceOf(address).call();

      return free?.toString() || '0';
    }
  } else {
    const options = getAssetOptions(tokenInfo!.symbol, 'soraAsset', tokenInfo!.id);

    const _balance = await api?.query.tokens.accounts(address, options);
    console.info(_balance.toHuman(), api, '_balance');

    return '';
    // return balance.availableBalance?.toBn()?.toString() || '0';
  }
}

async function subscribeTokensBalance(
  address: string,
  networkKey: string,
  api: ApiPromise,
  setBalance: (networkKey: string, rs: BalanceItem) => void
) {
  const { parentId, assets, name: networkName } = state.networkMap[networkKey];

  const tokenList = assets.map(({ assetId, type, isNative, isUtility, purchaseProviders, staking }) => {
    const searchedAsset = state.tokenMap.find(({ id }) => id === assetId)!;
    const relayChain = (Object.values(state.networkMap).find(({ chainId }) => chainId === parentId)?.name ??
      networkName) as RelayChainName;

    return {
      ...searchedAsset,
      purchaseProviders,
      staking,
      relayChain: relayChain,
      type: type ?? 'native',
      isNative,
      isUtility,
    };
  });

  const unsubList = await Promise.all(
    tokenList.map(({ precision, symbol, id, type, icon, relayChain, displayName }) => {
      try {
        const options = getAssetOptions(symbol, type, id);

        const query = api!.rx.query;
        let pallet;

        if (type === 'native') pallet = query.system.account(address);
        else if (type === 'equilibrium') pallet = query.eqBalances.reserved(address, options);
        else pallet = query.tokens.accounts(address, options);

        const onBalanceFetch = (balances: any) => {
          const { frozen, locked, reserved, total, transferable } = formatBalance(
            balances.data ? (balances as any).data : (balances as OrmlAccountData),
            precision
          );
          const name = displayName ?? symbol;

          setBalance(networkKey, {
            state: APIItemState.READY,
            chain: networkKey,
            key: networkKey,
            symbol,
            relayChain,
            name,
            icon,
            reserved,
            locked,
            frozen,
            transferable,
            total,
          });
        };

        pallet.subscribe(onBalanceFetch);

        return pallet;
      } catch (err: any) {
        console.warn(err.message, networkKey, `type: ${type}`);
      }

      return undefined;
    })
  );

  return () => {
    unsubList.forEach((unsub) => {
      unsub;
    });
  };
}

export async function subscribeWithAccount(
  address: string,
  networkKey: string,
  networkAPI: ApiProps,
  setBalance: (networkKey: string, rs: BalanceItem) => void
) {
  let unsub: () => void;

  try {
    unsub = await subscribeTokensBalance(address, networkKey, networkAPI.api!, setBalance);
  } catch (err) {
    console.warn(err);
  }

  return () => {
    unsub && unsub();
  };
}

export function subscribeBalance(
  address: string,
  ethereumAddress: string,
  dotSamaApiMap: Record<string, ApiProps>,
  web3ApiMap: Record<string, EthProvider>,
  setBalance: (networkKey: string, rs: BalanceItem) => void
) {
  state.generateDefaultBalance(address);

  const unsubList = Object.entries(dotSamaApiMap).map(async ([networkKey, apiProps]) => {
    await apiProps.api?.isReadyOrError;

    if (['ethereum', 'ethereum_goerli'].includes(networkKey)) {
      return subscribeEVMBalance(networkKey, apiProps.api!, [ethereumAddress], web3ApiMap, setBalance); // todo [ethereumAddress] -> ethereumAddress
    }

    const addressForNetwork = isEthereumNetwork(networkKey) ? ethereumAddress : address;

    return subscribeWithAccount(addressForNetwork, networkKey, apiProps, setBalance);
  });

  return () => {
    unsubList.forEach((subProm) => {
      subProm
        .then((unsub) => {
          unsub && unsub();
        })
        .catch((err) => err);
    });
  };
}
