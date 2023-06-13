// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { Contract } from 'ethers';
import { state } from '@extension-base/background/handlers';
import { SUB_TOKEN_REFRESH_BALANCE_INTERVAL, ASTAR_REFRESH_BALANCE_INTERVAL } from '@extension-base/const/intervals';
import { sumBN } from '@extension-base/utils';
import { isEthereumNetwork } from '@extension-base/background/utils/utils';
import { getEVMBalance } from '@extension-base/api/evm/balance';
import EthProvider from '@extension-base/api/evm/ethProvider';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { APIItemState } from '@extension-base/api/types/networks';
import { getRegistry, getTokenInfo } from '@extension-base/api/substrate/registry';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import type { ApiProps } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { AssetJson, RelayChainName } from '@/interfaces';
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
  web3ApiMap: Record<string, EthProvider>,
  token?: string
): Promise<string> {
  const apiProps = state.getSubstrateApiMap[networkKey];
  await apiProps.api?.isReady;

  const api = apiProps.api!;
  const web3Api = state.getEvmApiMap[networkKey];
  const tokenInfo = token ? getTokenInfo(token) : undefined;

  const isMainToken = tokenInfo ? await checkMainToken(networkKey, tokenInfo?.id) : false;

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
      isUtility: isUtility ?? false,
    };
  });

  const unsubList = await Promise.all(
    tokenList.map(({ precision, symbol, id, type, relayChain, displayName }) => {
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
            relayChain,
            name,
            id,
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
  setBalance: (networkKey: string, rs: BalanceItem) => void
) {
  state.generateDefaultBalance(address);

  const unsubList = Object.entries(state.getSubstrateApiMap).map(async ([networkKey, apiProps]) => {
    await apiProps.api?.isReadyOrError;

    if (['ethereum', 'ethereum_goerli'].includes(networkKey)) {
      return subscribeEVMBalance(networkKey, apiProps.api!, [ethereumAddress], state.getEvmApiMap, setBalance); // todo [ethereumAddress] -> ethereumAddress
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
