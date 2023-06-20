import { ApiPromise } from '@polkadot/api';
import { state } from '@extension-base/background/handlers';
import { isEthereumNetwork } from '@extension-base/background/utils/utils';
import { subscribeEVMBalance } from '@extension-base/api/evm/balance';
import { APIItemState } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import type { ApiProps } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { RelayChainName } from '@/interfaces';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';

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

  const unsubList = await Promise.all(
    assets.map(({ precision, symbol, id, type }) => {
      try {
        const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

        const options = getAssetOptions(symbol, type, id);

        const query = api!.rx.query;
        let pallet;

        if (type === 'normal') pallet = query.system.account(address);
        else if (type === 'equilibrium') pallet = query.eqBalances.reserved(address, options);
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
