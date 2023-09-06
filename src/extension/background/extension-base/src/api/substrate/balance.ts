import { ApiPromise } from '@polkadot/api';
import { state } from '@extension-base/background/handlers';
import { isEthereumNetwork } from '@extension-base/background/utils/utils';
import { APIItemState } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import { FPNumber } from '@sora-substrate/util';
import { getValidatorsInfo } from './testStaking/test';
import type { ApiProps } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { RelayChainName } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';
import { SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/sora';
import { isSora } from '@/helpers';

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

  if (isSora(networkName)) {
    getValidatorsInfo(api);

    // getNominatorsReward(api, 'cnRuNZdDB156ohr7DrVDq5Dkn6QUBWLm4sxqhXunRc1jJKnua');
  }

  if (networkName === 'Equilibrium') {
    const pallet = api!.rx.query.system.account(address);

    const unsub = pallet.subscribe((balances: any) => {
      const asV0 = balances.data['asV0'];
      const locked = FPNumber.fromCodecValue((asV0.lock as u128).toNumber(), 9); // TODO: 9 дефолтный precision, уточнить насчет asV0.lock
      const balance: any[] = asV0.balance;

      const notZeroBalances = balance.map(([key, { asPositive }]) => {
        const _currencyId = (key as u128).toString();
        const balanceValue = (asPositive as u128).toNumber();

        const { symbol, id, precision } = assets.find(({ currencyId }) => currencyId === _currencyId)!;

        const transferable = FPNumber.fromCodecValue(balanceValue, precision);

        setBalance(networkKey, {
          state: APIItemState.READY,
          relayChain,
          symbol: symbol,
          id,
          reserved: '0',
          frozen: '0',
          total: locked.add(transferable).toString(),
          locked: locked.toString(),
          transferable: transferable.toString(),
        });

        return id;
      });

      // У Equilibrium system.account это "особенный" паллет, балансы возвращаются разом для всех токенов
      // Причем возвращаются только не нулевые балансы
      // Поэтому нужно пройтись по остальным(нулевым) балансам и проставить для них статуc Ready, тк по факту мы их "получили" и знаем, что они = 0
      assets.forEach(({ id, symbol }) => {
        if (!notZeroBalances.includes(id))
          setBalance(networkKey, {
            state: APIItemState.READY,
            relayChain,
            symbol,
            id,
            reserved: '0',
            frozen: '0',
            total: '0',
            locked: '0',
            transferable: '0',
          });
      });
    });

    return () => unsub;
  }

  const unsubList = await Promise.all(
    assets.map(({ precision, symbol, id, type }) => {
      try {
        const options = getAssetOptions(id);

        if (!api || !api.rx) return undefined;

        const query = api.rx.query;

        let pallet;

        const networkNameLower = networkName.toLowerCase();
        const isSoraXOR =
          symbol === SORA_UTILITY_ASSET && (networkNameLower === SORA_MAINNET || networkNameLower === SORA_TEST);

        if (type === 'normal' || isSoraXOR) pallet = query.system.account(address);
        else if (type === 'assets') {
          pallet = (query.assets as any).account(options, address);
        } else pallet = query.tokens.accounts(address, options);

        const onBalanceFetch = (balances: any) => {
          const balance =
            type === 'assets'
              ? {
                  free: FPNumber.fromCodecValue(balances.toJSON()?.balance ?? 0, precision),
                }
              : balances.data
              ? balances.data
              : balances;

          const { frozen, locked, reserved, total, transferable } = formatBalance(balance, precision);

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
  const unsubList = Object.entries(state.getSubstrateApiMap).map(async ([networkKey, apiProps]) => {
    const isReady = await apiProps.api?.isReadyOrError;

    if (!isReady) return;

    const addressForNetwork = isEthereumNetwork(networkKey) ? ethereumAddress : address;

    // case: if ethereumAddress === ''
    if (addressForNetwork === '') return () => null;

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
