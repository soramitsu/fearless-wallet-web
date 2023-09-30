import { Subscription } from 'rxjs';
import { ApiPromise } from '@polkadot/api';
import { state } from '@extension-base/background/handlers';
import { getSubstrateAddress, isEthereumNetwork } from '@extension-base/background/utils/utils';
import { APIItemState } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import { FPNumber } from '@sora-substrate/util';
import { setBalance } from '../helpers';
import type { ApiProps } from '@extension-base/background/types/types';
import type { Fn, NetworkName, RelayChainName } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS, SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/networks';
import { isSoraTest } from '@/helpers';

async function subscribeTokensBalance(address: string, networkKey: string, api: ApiPromise) {
  const {
    parentId,
    assets,
    name: networkName,
  } = state.networksJson.find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!;
  const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

  if (networkName === 'Equilibrium') {
    const pallet = api!.rx.query.system.account(address);

    const sub = pallet.subscribe((balances: any) => {
      const asV0 = balances.data['asV0'];
      const locked = FPNumber.fromCodecValue((asV0.lock as u128).toNumber(), 9); // TODO: 9 дефолтный precision, уточнить насчет asV0.lock
      const balance: any[] = asV0.balance;

      const notZeroBalances = balance.map(([key, { asPositive }]) => {
        const _currencyId = (key as u128).toString();
        const balanceValue = (asPositive as u128).toNumber();

        const { symbol, id, precision } = assets.find(({ currencyId }) => currencyId === _currencyId)!;

        const transferable = FPNumber.fromCodecValue(balanceValue, precision);

        setBalance(
          networkKey,
          {
            state: APIItemState.READY,
            relayChain,
            symbol: symbol,
            id,
            reserved: '0',
            frozen: '0',
            total: locked.add(transferable).toString(),
            locked: locked.toString(),
            transferable: transferable.toString(),
          },
          address
        );

        return id;
      });

      // У Equilibrium system.account это "особенный" паллет, балансы возвращаются разом для всех токенов
      // Причем возвращаются только не нулевые балансы
      // Поэтому нужно пройтись по остальным(нулевым) балансам и проставить для них статуc Ready, тк по факту мы их "получили" и знаем, что они = 0
      const substrateAddress = getSubstrateAddress(address);
      assets.forEach(({ id, symbol }) => {
        if (!notZeroBalances.includes(id))
          setBalance(
            networkKey,
            {
              state: APIItemState.READY,
              relayChain,
              symbol,
              id,
              reserved: '0',
              frozen: '0',
              total: '0',
              locked: '0',
              transferable: '0',
            },
            substrateAddress
          );
      });
    });

    return () => sub.unsubscribe();
  }

  const unsubList = await Promise.all(
    assets.map(({ precision, symbol, id, type }) => {
      try {
        const options = getAssetOptions(id);

        if (!api || !api.rx) return () => null;

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
          const substrateAddress = getSubstrateAddress(address);

          setBalance(
            networkKey,
            {
              state: APIItemState.READY,
              relayChain,
              symbol,
              id,
              reserved,
              locked,
              frozen,
              transferable,
              total,
            },
            substrateAddress
          );
        };

        const sub: Subscription = pallet.subscribe(onBalanceFetch);

        return () => sub.unsubscribe();
      } catch (err: any) {
        setBalance(
          networkKey,
          {
            state: APIItemState.ERROR,
            relayChain,
            symbol,
            id,
          },
          address
        );
        console.warn(err.message, networkKey, `type: ${type}`);
      }

      return () => null;
    })
  );

  return () => unsubList.forEach((unsubscribe) => unsubscribe());
}

export async function subscribeWithAccount(address: string, networkKey: string, networkAPI: ApiProps): Promise<Fn> {
  const unsub = await subscribeTokensBalance(address, networkKey, networkAPI.api!).catch((e) => {
    console.info(`Failed to subscribe to ${networkKey}`, e);
  });

  return () => {
    unsub?.();
  };
}

export function subscribeBalance(address: string, ethereumAddress: string, newNetworks: NetworkName[] | null): Fn {
  const unsubList = Object.entries(state.getSubstrateApiMap).map(async ([networkKey, apiProps]) => {
    const isNewNetwork = newNetworks !== null ? newNetworks.includes(networkKey) : true; // если список  === null, значит коннектимся ко всем сетям

    if (!isNewNetwork) return () => state.getSubstrateApiMap[networkKey]?.api?.disconnect();

    const isReady = isSoraTest(networkKey)
      ? await new Promise((res) =>
          setTimeout(async () => {
            const isReady = await apiProps.api?.isReady;

            res(isReady);
          }, 2000)
        )
      : await apiProps.api?.isReady;

    if (!isReady) return () => null;

    const addressForNetwork = isEthereumNetwork(networkKey) ? ethereumAddress : address;

    if (addressForNetwork === '') return () => null;

    return subscribeWithAccount(addressForNetwork, networkKey, apiProps);
  });

  return () =>
    unsubList.forEach(async (unsubscribe) => {
      const unsub = await unsubscribe;

      unsub?.();
    });
}
