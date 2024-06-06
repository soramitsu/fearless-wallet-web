import { type Subscription } from 'rxjs';
import { type ApiPromise } from '@polkadot/api';
import { isEthereumNetwork, getUtilityProps } from '@extension-base/background/utils/utils';
import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate/utils';
import { FPNumber } from '@sora-substrate/util';
import { setBalance } from '@extension-base/api/helpers';
import type State from '@extension-base/background/handlers/State';
import type { RelayChainName, NetworkName } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';
import { SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/sora';
import { isSameString, isSora } from '@/helpers';

function subscribeTokensBalance(address: string, networkKey: string, api: ApiPromise, state: State) {
  const {
    parentId,
    assets,
    name: networkName,
  } = state.networkService.networksGithub.find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!;

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
          address,
          state
        );

        return id;
      });

      // У Equilibrium system.account это "особенный" паллет, балансы возвращаются разом для всех токенов
      // Причем возвращаются только не нулевые балансы
      // Поэтому нужно пройтись по остальным(нулевым) балансам и проставить для них статуc Ready, тк по факту мы их "получили" и знаем, что они = 0
      const substrateAddress = state.keyringService.getSubstrateAddress(address);

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
            substrateAddress,
            state
          );
      });
    });

    return () => sub.unsubscribe();
  }

  const unsubList = assets.map(({ precision, symbol, id, type }) => {
    try {
      const options = getAssetOptions(id, state.assetsMap);

      if (!api || !api.rx) return () => null;

      const query = api.rx.query;

      const isSoraXOR =
        symbol === SORA_UTILITY_ASSET &&
        (isSameString(networkName, SORA_MAINNET) || isSameString(networkName, SORA_TEST));

      const pallet =
        type === 'normal' || isSoraXOR
          ? query.system.account(address)
          : type === 'assets'
          ? (query.assets as any).account(options, address)
          : query.tokens.accounts(address, options);

      const onBalanceFetch = (balances: any) => {
        const balance =
          type === 'assets'
            ? {
                free: FPNumber.fromCodecValue(balances.toJSON()?.balance ?? 0, precision),
              }
            : balances?.data ?? balances
            ? balances.data
            : balances;

        const { frozen, locked, reserved, total, transferable } = formatBalance(balance, precision);
        const substrateAddress = state.keyringService.getSubstrateAddress(address);

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
          substrateAddress,
          state
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
        address,
        state
      );

      console.warn(err.message, networkKey);
    }

    return () => null;
  });

  return () => unsubList.forEach((unsubscribe) => unsubscribe());
}

export function subscribeBalance(
  address: string,
  ethereumAddress: string,
  newNetworks: NetworkName[] | null,
  state: State
) {
  const unsubListPromises = Object.entries(state.getSubstrateApiMap)
    .filter(([networkName]) => {
      // если список  === null, значит коннектимся ко всем включенным сетям
      if (newNetworks === null) return true;

      return newNetworks.some((net) => net.toLowerCase() === networkName.toLowerCase());
    })
    .map(([networkName, apiProps]) => {
      return new Promise<{
        networkName: string;
        unsub: () => void;
      }>((res) => {
        const network = state.networkMap[networkName];
        const isSoraNetwork = isSora(networkName);
        const timespan = Date.now();

        const addressForNetwork = isEthereumNetwork(networkName) ? ethereumAddress : address;

        if (addressForNetwork === '')
          return {
            networkName,
            unsub: () => {},
          };

        const subscribeOnReady = () => {
          if (!apiProps.api) {
            if (network?.networkStatus !== NETWORK_STATUS.DISCONNECTED) setTimeout(subscribeOnReady, 1000);
            else res({ networkName, unsub: () => {} });
          } else
            apiProps.api.isReadyOrError
              .then(() => {
                try {
                  const unsub = subscribeTokensBalance(addressForNetwork, networkName, apiProps.api!, state);

                  res({ networkName, unsub });
                } catch (e) {
                  res({ networkName, unsub: () => {} });
                }
              })
              .catch(() => res({ networkName, unsub: () => {} }));
        };

        if (isSoraNetwork) {
          apiProps.api?.isReadyOrError
            .then(() => {
              try {
                const unsub = subscribeTokensBalance(addressForNetwork, networkName, apiProps.api!, state);

                res({ networkName, unsub });
              } catch (e) {
                res({ networkName, unsub: () => {} });
              }
            })
            .catch(() => {
              if (Date.now() - timespan > 60000) res({ networkName, unsub: () => {} });
              else setTimeout(subscribeOnReady, 1000);
            });
        }
        // Sora сеть проверяем через setInterval
        // потому, что instance api сохраняется в state.apis только, когда подключились к сети(см api.ts, onConnected)
        // у остальных сетей такой проблемы нет, потому что api мы сохраняем сразу при создании
        // если прошло 60 сек и api не появилось, отписываемся и резолвим false

        setTimeout(subscribeOnReady, 1000);
      });
    });

  return unsubListPromises;
}

export async function fetchBalance(address: string, networkKey: string, state: State, api?: ApiPromise) {
  const { id, symbol, type, precision } = getUtilityProps(networkKey, state);
  const options = getAssetOptions(id, state.assetsMap);

  if (!api) return '0';

  const query = api.query;

  let response;

  const isSoraXOR =
    symbol === SORA_UTILITY_ASSET && (isSameString(networkKey, SORA_MAINNET) || isSameString(networkKey, SORA_TEST));

  if (type === 'normal' || isSoraXOR) response = query.system.account(address);
  else if (type === 'assets') response = (query.assets as any).account(options, address);
  else response = query.tokens.accounts(address, options);

  const balances = await response;

  const balance =
    type === 'assets'
      ? {
          free: FPNumber.fromCodecValue(balances.toJSON()?.balance ?? 0, precision),
        }
      : balances?.data ?? balances;

  const { transferable } = formatBalance(balance, precision);

  return transferable;
}
