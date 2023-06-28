import { ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { Contract } from 'ethers';
import { state } from '@extension-base/background/handlers';
import { SUB_TOKEN_REFRESH_BALANCE_INTERVAL, ASTAR_REFRESH_BALANCE_INTERVAL } from '@extension-base/const/intervals';
import { sumBN } from '@extension-base/utils';
import { isEthereumNetwork } from '@extension-base/background/utils/utils';
import { getEVMBalance } from '@extension-base/api/evm/balance';
import EthProvider from '@extension-base/api/evm/ethProvider';
import { getERC20Contract } from '@extension-base/api/evm/utils/eth';
import { APIItemState } from '@extension-base/api/types/networks';
import { getRegistry } from '@extension-base/api/substrate/registry';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import { FPNumber } from '@sora-substrate/util';
import type { Asset } from '@extension-base/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { RelayChainName } from '@/interfaces';
import type { u64, u128 } from '@polkadot/types-codec';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';

function subscribeERC20Interval(
  addresses: string[],
  networkKey: string,
  api: ApiPromise,
  web3ApiMap: Record<string, EthProvider>,
  subCallback: (rs: Partial<BalanceItem>) => void
): () => void {
  let tokenList: Asset[] = [];
  const ERC20ContractMap = {} as Record<string, Contract>;

  const getTokenBalances = () => {
    tokenList.map(async ({ symbol }) => {
      let free = new BN(0);

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
    .then(({ assetsMap }) => {
      tokenList = assetsMap.filter(({ contractAddress }) => !!contractAddress);

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
  callback: (networkKey: string, rs: Partial<BalanceItem>) => void
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

  function subCallback(item: Partial<BalanceItem>) {
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

  return (
    state.networksJson
      .find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!
      .assets.find((asset) => asset.id === id)?.isUtility ?? false
  );
}

async function subscribeTokensBalance(
  address: string,
  networkKey: string,
  api: ApiPromise,
  setBalance: (networkKey: string, rs: Partial<BalanceItem>) => void
) {
  const {
    parentId,
    assets,
    name: networkName,
  } = state.networksJson.find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!;
  const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

  if (networkName === 'Equilibrium') {
    const pallet = api!.rx.query.system.account(address);

    const unsub = pallet.subscribe((balances: any) => {
      const asV0 = balances.data['asV0'];
      const locked = (asV0.lock as u128).toString();
      const balance: any[] = asV0.balance;

      balance.forEach(([key, { asPositive }]) => {
        const _currencyId = (key as u128).toString();
        const balanceValue = (asPositive as u128).toNumber();

        const { symbol, id, precision } = assets.find(({ currencyId }) => currencyId === _currencyId)!;

        setBalance(networkKey, {
          state: APIItemState.READY,
          relayChain,
          symbol: symbol,
          id,
          reserved: '0',
          frozen: '0',
          total: '0',
          locked,
          transferable: FPNumber.fromCodecValue(balanceValue, precision).toString(),
        });
      });

      return;
    });

    return () => unsub;
  }

  const unsubList = await Promise.all(
    assets.map(({ precision, symbol, id, type }) => {
      try {
        const options = getAssetOptions(id);
        const query = api!.rx.query;

        let pallet;

        if (type === 'normal') pallet = query.system.account(address);
        else if (type === 'assets') pallet = query.assets.account(options, address);
        else pallet = query.tokens.accounts(address, options);

        const onBalanceFetch = (balances: any) => {
          const { frozen, locked, reserved, total, transferable } = formatBalance(
            balances.data ? (balances as any).data : (balances as OrmlAccountData),
            precision
          );

          setBalance(networkKey, {
            state: APIItemState.READY,
            relayChain,
            symbol,
            id,
            reserved,
            locked,
            frozen,
            transferable,
            total,
          });
        };

        return pallet.subscribe(onBalanceFetch);
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
  setBalance: (networkKey: string, rs: Partial<BalanceItem>) => void
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
  setBalance: (networkKey: string, rs: Partial<BalanceItem>) => void
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
