// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { assetFromToken } from '@equilab/api';
import { SignedBalance } from '@equilab/api/genshiro/interfaces';
import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { BigNumber, Contract } from 'ethers';
import { DeriveBalancesAll } from '@polkadot/api-derive/types';
import { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { AccountData } from '@polkadot/types/interfaces';
import { state } from '../../background/handlers';

import { ApiProps } from '../../background/types';
import {
  SUB_TOKEN_REFRESH_BALANCE_INTERVAL,
  ASTAR_REFRESH_BALANCE_INTERVAL,
  SUBSCRIBE_BALANCE_FAST_INTERVAL,
} from '../../const/intervals';
import { sumBN } from '../../utils';
import { getEVMBalance } from '../evm/balance';
import EthProvider from '../evm/ethProvider';
import { APIItemState, BalanceItem, TokenInfo } from '../evm/types/ether';
import { getERC20Contract } from '../evm/utils/eth';
import { IGNORE_GET_SUBSTRATE_FEATURES_LIST } from '../../const';
import { getPSP22ContractPromise } from '../tokens/wasm';
import { categoryAddresses } from '../../utils/utils';
import { ORML_PALLETS_TYPES } from '../../const/networks';
import { getRegistry, getTokenInfo } from './registry';
import { getAssetOptions } from './utils';
import { AssetJson, TypeAsset } from '@/interfaces';
import { formatBalance } from '@/util/balances';

type EqBalanceItem = [number, { positive: number }];

function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: BalanceItem) => void
): () => void {
  let tokenList = {} as TokenInfo[];
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    Object.values(tokenList).map(async ({ symbol }) => {
      let free = new BN(0);

      try {
        const contract = ERC20ContractMap[symbol];
        const bals = await Promise.all(
          addresses.map((address): Promise<string> => {
            return contract.methods.balanceOf(address).call();
          })
        );

        free = sumBN(bals.map((bal) => new BN(bal || 0)));
        // console.log('TokenBals', symbol, addresses, bals, free);

        subCallback({
          state: APIItemState.READY,
          symbol,
          reserved: '0',
          feeFrozen: '0',
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

      const free = await contract.methods.balanceOf(address).call();

      return free?.toString() || '0';
    }
  } else {
    // if (token) {
    //   if (['genshiro_testnet', 'genshiro'].includes(networkKey)) {
    //     const asset = assetFromToken(token);
    //     const balance = await api.query.eqBalances.account(address, asset);

    //     // eslint-disable-next-line
    //     // @ts-ignore
    //     return balance.asPositive?.toString() || '0';
    //   } else if (['equilibrium_parachain'].includes(networkKey)) {
    //     const balance = (await api.query.system.account(address)) as any;

    //     const balancesData = JSON.parse(balance.data.toString()) as EqBalanceItem[];
    //     let freeTokenBalance: EqBalanceItem | undefined;

    //     if (tokenInfo && tokenInfo.specialOption) {
    //       // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //       // @ts-ignore
    //       freeTokenBalance = balancesData.find((data: EqBalanceItem) => data[0] === tokenInfo.specialOption?.assetId);
    //     } else {
    //       freeTokenBalance = balancesData[0];
    //     }

    //     return freeTokenBalance ? freeTokenBalance[1].positive.toString() : '0';
    //   } else if (
    //     tokenInfo &&
    //     ((networkKey === 'crab' && tokenInfo.symbol === 'CKTON') ||
    //       (networkKey === 'pangolin' && tokenInfo.symbol === 'PKTON'))
    //   ) {
    //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //     // @ts-ignore
    //     const balance = (await api.query.system.account(address)) as { data: { freeKton: Balance } };

    //     return balance.data?.freeKton?.toString() || '0';
    //   } else if (!isMainToken && ['astar', 'shiden', 'statemint', 'statemine'].includes(networkKey)) {
    //     const balanceInfo = (await api.query.assets.account(tokenInfo?.assetIndex, address)).toHuman() as Record<
    //       string,
    //       string
    //     >;

    //     return balanceInfo?.balance?.replaceAll(',', '') || '0';
    //   } else if (!isMainToken || ['kintsugi', 'kintsugi_test', 'interlay'].includes(networkKey)) {
    //     const balance: TokenBalanceRaw = await api.query.tokens.accounts(address, { Token: token });

    //     return balance.free?.toString() || '0';
    //   }
    // }

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
  dotSamaApiMap: Record<string, ApiProps>,
  web3ApiMap: Record<string, EthProvider>,
  token: string | undefined,
  update: (balance: BigNumber) => void
): Promise<() => void> {
  const apiProps = await dotSamaApiMap[networkKey].isReady;
  const api = apiProps.api;
  const web3Api = web3ApiMap[networkKey];
  const tokenInfo = token ? await getTokenInfo(networkKey, api, token) : undefined;
  const isMainToken = tokenInfo ? tokenInfo.isMainToken : true;

  // Only EVM Address use with EVM network
  if (Boolean(web3Api || apiProps.isEthereum) !== isEthereumAddress(address)) {
    if (!isEthereumAddress(address)) {
      update(BigNumber.from(0));

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
    if (isMainToken) {
      const getEvmMainBalance = () => {
        web3Api.provider.getBalance(address).then(update).catch(console.info);
      };

      return responseIntervalSubscription(getEvmMainBalance);
    } else {
      const getERC20FreeBalance = () => {
        if (!tokenInfo?.contractAddress) {
          return;
        }

        const contract = getERC20Contract(networkKey, tokenInfo.contractAddress, web3ApiMap);

        contract.methods
          .balanceOf(address)
          .call()
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          .then((free) => {
            update(free?.toString() || '0');
          });
      };

      return responseIntervalSubscription(getERC20FreeBalance);
    }
  } else {
    // Handle WASM tokens
    if (token) {
      if (tokenInfo && tokenInfo.type) {
        const getPSP22FreeBalance = () => {
          if (!tokenInfo?.contractAddress) return;

          const contractPromise = getPSP22ContractPromise(api, tokenInfo.contractAddress);

          contractPromise.query['psp22::balanceOf'](address, { gasLimit: -1 }, address)
            .then((balanceOf) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              //@ts-ignore
              update(balanceOf.output ? balanceOf.output.toString() : '0');
            })
            .catch(console.error);
        };

        return responseIntervalSubscription(getPSP22FreeBalance);
      }

      if (['genshiro_testnet', 'genshiro'].includes(networkKey)) {
        const asset = assetFromToken(token);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const unsub = await api.query.eqBalances.account(address, asset, (balance) => {
          update(balance.asPositive.toString() || '0');
        });

        return () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          unsub && unsub();
        };
      }

      if (['equilibrium_parachain'].includes(networkKey)) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const unsub = await api.query.system.account(address, (balance) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
          const balancesData = JSON.parse(balance.data.toString()) as EqBalanceItem[];
          let freeTokenBalance: EqBalanceItem | undefined;

          if (tokenInfo && tokenInfo.specialOption) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            freeTokenBalance = balancesData.find((data: EqBalanceItem) => data[0] === tokenInfo.specialOption?.assetId);
          } else {
            freeTokenBalance = balancesData[0];
          }

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          update(freeTokenBalance ? freeTokenBalance[1].positive.toString() : '0');
        });

        return () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          unsub && unsub();
        };
      }

      if (
        tokenInfo &&
        ((networkKey === 'crab' && tokenInfo.symbol === 'CKTON') ||
          (networkKey === 'pangolin' && tokenInfo.symbol === 'PKTON'))
      ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const unsub = await api.query.system.account(address, (balance: DeriveBalancesAll) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          update(balance.data?.freeKton?.toBn()?.toString() || '0');
        });

        return () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          unsub && unsub();
        };
      }

      if (!isMainToken && ['astar', 'shiden', 'statemint', 'statemine'].includes(networkKey)) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const unsub = await api.query.assets.account(tokenInfo?.assetIndex, address, (_balanceInfo) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
          const balanceInfo = _balanceInfo.toHuman() as Record<string, string>;

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          update(balanceInfo?.balance?.replaceAll(',', '') || '0');
        });

        return () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          unsub && unsub();
        };
      }

      if (!isMainToken || ['kintsugi', 'kintsugi_test', 'interlay'].includes(networkKey)) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const unsub = await api.query.tokens.accounts(
          address,
          tokenInfo?.specialOption || { Token: token },
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          (balance) => {
            update(balance.free?.toString() || '0');
          }
        );

        return () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          unsub && unsub();
        };
      }
    }

    if (
      ['kusama', 'kintsugi', 'kintsugi_test', 'interlay', 'acala', 'statemint', 'karura', 'bifrost'].includes(
        networkKey
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const unsub = await api.query.system.account(address, (_balance) => {
        const balance = _balance.toHuman();
        const freeBalance = new BN(balance.data?.free.replaceAll(',', ''));
        const miscFrozen = new BN(balance.data?.miscFrozen.replaceAll(',', ''));
        const transferable = freeBalance.sub(miscFrozen);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        update(transferable.toString() || '0');
      });

      return () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        unsub && unsub();
      };
    }

    const unsub = await api.derive.balances?.all(address, (balance: DeriveBalancesAll) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      update(balance.availableBalance?.toBn()?.toString() || '0');
    });

    return () => {
      unsub && unsub();
    };
  }
}

async function subscribeWithAccountMulti(
  addresses: string[],
  networkKey: string,
  networkAPI: ApiProps,
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  //move elsewhere
  function setBalance(item: BalanceItem) {
    callback(networkKey, item);
  }

  let unsub: () => void;

  try {
    unsub = await subscribeTokensBalance(addresses, networkKey, networkAPI.api, setBalance);
  } catch (err) {
    console.warn(err);
  }

  return () => {
    unsub && unsub();
  };
}

async function subscribeTokensBalance(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  setBalance: (rs: BalanceItem) => void
) {
  const tokenList = state.networkMap[networkKey].assets.map((asset) => {
    const searchedAsset = state.tokenMap.find((token) => token.id === asset.assetId) as AssetJson;
    setBalance({
      state: APIItemState.PENDING,
      symbol: searchedAsset.symbol,
      free: '0',
      reserved: '0',
      miscFrozen: '0',
      feeFrozen: '0',
    });

    return {
      ...searchedAsset,
      type: asset.type ?? ('native' as TypeAsset),
      isNative: asset.isNative,
      isUtility: asset.isUtility,
    };
  });

  await api.isReady;

  if (tokenList.length > 0) console.info('Get tokens balance of', networkKey, tokenList);

  const unsubList = await Promise.all(
    tokenList.map(async ({ precision, symbol, id, type, isUtility, icon }) => {
      try {
        const options = getAssetOptions(symbol, type, id);
        const assetType = type === 'equilibrium' ? 'eqBalances' : 'tokens';
        const assetFetchField = assetType === 'tokens' ? 'accounts' : 'account';
        //    .rx.query.system.account

        const pallet =
          isUtility && !ORML_PALLETS_TYPES.includes(type)
            ? api.rx.query.system.account(addresses[0])
            : api.rx.query[assetType][assetFetchField](addresses[0], options);

        const onBalanceFetch = (balances: any) => {
          const tokenBalance = formatBalance(balances as OrmlAccountData, precision);
          // console.info(tokenBalance, 'balances', networkKey, symbol);

          setBalance({
            state: APIItemState.READY,
            symbol,
            icon,
            free: tokenBalance.transferable,
            reserved: tokenBalance.reserved,
            feeFrozen: tokenBalance.frozen,
            total: tokenBalance.total,
          });
        };

        pallet.subscribe(onBalanceFetch);

        return pallet;
      } catch (err) {
        console.warn(err);
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

export function subscribeBalance(
  addresses: string[],
  dotSamaApiMap: Record<string, ApiProps>,
  web3ApiMap: Record<string, EthProvider>,
  callback: (networkKey: string, rs: BalanceItem) => void
) {
  const [substrateAddresses, evmAddresses] = categoryAddresses(addresses);

  const unsubList = Object.entries(dotSamaApiMap).map(async ([networkKey, apiProps]) => {
    const networkAPI = await apiProps.isReady;
    const useAddresses = apiProps.isEthereum ? evmAddresses : substrateAddresses;

    if (['ethereum', 'ethereum_goerli'].includes(networkKey)) {
      return subscribeEVMBalance(networkKey, networkAPI.api, useAddresses, web3ApiMap, callback);
    }

    if (!useAddresses || useAddresses.length === 0 || IGNORE_GET_SUBSTRATE_FEATURES_LIST.indexOf(networkKey) > -1) {
      // Return zero balance if not have any address
      const zeroBalance = {
        state: APIItemState.READY,
        free: '0',
        reserved: '0',
        miscFrozen: '0',
        feeFrozen: '0',
      } as BalanceItem;

      callback(networkKey, zeroBalance);

      return undefined;
    }

    return subscribeWithAccountMulti(useAddresses, networkKey, networkAPI, web3ApiMap, callback);
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
