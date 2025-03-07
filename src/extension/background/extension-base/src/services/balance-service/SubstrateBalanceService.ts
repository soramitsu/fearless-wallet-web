import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate';
import { FPNumber } from '@sora-substrate/util';
import EquilibriumBalanceService from './EquilibriumBalanceService';
import type { ApiPromise } from '@polkadot/api';
import type { Subscription } from 'rxjs';
import type { FetchBalancePayload, ResponseBalanceRequest } from '../../background/types/types';
import type { GetBalancesProps } from '../subscription-service';
import type State from '@extension-base/background/handlers/State';
import type { RelayChainName, NetworkName } from '@/interfaces';
import { isEthereumNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';
import { SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/sora';
import { isSameString, isSora } from '@/helpers';

const mockUnsubFn = () => {};

export default class SubstrateBalanceService {
  private readonly equilibriumBalanceService: EquilibriumBalanceService;

  constructor(private readonly state: State) {
    this.equilibriumBalanceService = new EquilibriumBalanceService(state);
  }

  async fetchBalance({
    address,
    ethereumAddress,
    networks = [],
  }: FetchBalancePayload): Promise<ResponseBalanceRequest[]> {
    const promises = networks.map(async (networkKey) => {
      const api = this.state.getSubstrateApiMap[networkKey.toLowerCase()]?.api;

      const {
        parentId,
        name: networkName,
        assets,
      } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, networkKey))!;

      const assetsPromises = assets.map(async ({ precision, symbol, id, type }) => {
        const options = getAssetOptions(id, this.state.networkService.assetsMap);

        const addressByNetwork = isEthereumNetwork(networkKey) ? ethereumAddress! : address!;

        const query = api?.query;

        if (!query) return { balance: '0', network: networkKey, assetId: id };

        let response;

        const isSoraXOR =
          symbol === SORA_UTILITY_ASSET &&
          (isSameString(networkKey, SORA_MAINNET) || isSameString(networkKey, SORA_TEST));

        if (type === 'normal' || isSoraXOR) response = query.system.account(addressByNetwork);
        else if (type === 'assets') response = (query.assets as any).account(options, addressByNetwork);
        else response = query.tokens.accounts(addressByNetwork, options);

        const balances = await response;

        const balance =
          type === 'assets'
            ? {
                free: FPNumber.fromCodecValue(balances.toJSON()?.balance ?? 0, precision),
              }
            : balances?.data ?? balances;

        const { frozen, locked, reserved, total, transferable } = formatBalance(balance, precision);

        const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state: APIItemState.READY,
            relayChain,
            symbol,
            id,
            reserved,
            frozen,
            total,
            locked,
            transferable: transferable.toString(),
          },
          address!
        );

        return {
          balance: transferable,
          network: networkKey,
          assetId: id,
        };
      });

      return await Promise.all(assetsPromises);
    });

    return (await Promise.all(promises)).flat();
  }

  subscribeSubstrateAssetsBalances(address: string, networkKey: NetworkName, api: ApiPromise, state: State) {
    const {
      parentId,
      assets,
      name: networkName,
    } = state.networkService.networksGithub.find(({ name }) => isSameString(name, networkKey))!;

    const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

    if (networkName === 'Equilibrium') return this.equilibriumBalanceService.subscribeBalance(address, api);

    const unsubList = assets.map(({ precision, symbol, id, type }) => {
      try {
        const options = getAssetOptions(id, state.networkService.assetsMap);

        if (!api || !api.rx) return () => null;

        const query = api.rx.query;

        const isSoraXOR = symbol === SORA_UTILITY_ASSET && isSora(networkName, true);

        const pallet =
          type === 'normal' || isSoraXOR
            ? query.system.account(address ?? '')
            : type === 'assets'
            ? (query.assets as any).account(options, address ?? '')
            : query.tokens?.accounts(address, options);

        const onBalanceFetch = (balances: any) => {
          const balance =
            type === 'assets'
              ? {
                  free: FPNumber.fromCodecValue(balances.toJSON()?.balance ?? 0, precision),
                }
              : balances.data ?? balances;

          const { frozen, locked, reserved, total, transferable } = formatBalance(balance, precision);
          const substrateAddress = state.keyringService.getSubstrateAddress(address);

          state.balanceService.setBalanceItem(
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

        const sub: Subscription = pallet?.subscribe(onBalanceFetch);

        return () => sub?.unsubscribe();
      } catch (err: any) {
        state.balanceService.setBalanceItem(
          networkKey,
          {
            state: APIItemState.ERROR,
            relayChain,
            symbol,
            id,
          },
          address
        );

        console.warn(err.message, networkKey);

        return mockUnsubFn;
      }
    });

    return () => unsubList.forEach((unsubscribe) => unsubscribe());
  }

  subscribeSubstrateBalances(props: GetBalancesProps, state: State) {
    const { address, ethereumAddress, substrateNetworks } = props;

    const networksEntries = Object.entries(state.getSubstrateApiMap).filter(([networkName]) =>
      substrateNetworks?.some((net) => isSameString(net, networkName))
    );

    const unsubListPromises: Promise<{
      networkName: string;
      unsub: () => void;
    }>[] = networksEntries.map(([networkName, apiProps]) => {
      const mockUnsub = {
        networkName,
        unsub: mockUnsubFn,
      };

      return new Promise((res) => {
        const network = state.networkService.networkMap[networkName];
        const isSoraNetwork = isSora(networkName);
        const timespan = Date.now();

        const addressByNetwork = isEthereumNetwork(networkName) ? ethereumAddress : address;

        if (addressByNetwork === '') return mockUnsub;

        const subscribeOnReady = () => {
          if (!apiProps.api) {
            if (network?.networkStatus !== NETWORK_STATUS.DISCONNECTED) {
              setTimeout(subscribeOnReady, 1000);

              return;
            }

            res(mockUnsub);

            return;
          }

          apiProps.api.isReadyOrError
            .then(() => {
              const unsub = this.subscribeSubstrateAssetsBalances(addressByNetwork, networkName, apiProps.api!, state);

              res({ networkName, unsub });
            })
            .catch(() => res(mockUnsub));
        };

        if (!isSoraNetwork) {
          setTimeout(subscribeOnReady, 1000);

          return;
        }

        apiProps.api?.isReadyOrError
          .then(() => {
            const unsub = this.subscribeSubstrateAssetsBalances(addressByNetwork, networkName, apiProps.api!, state);

            res({ networkName, unsub });
          })
          .catch(() => {
            // Sora сеть проверяем через setInterval
            // потому, что instance api сохраняется в state.apis только, когда подключились к сети(см api.ts, onConnected)
            // у остальных сетей такой проблемы нет, потому что api мы сохраняем сразу при создании
            // если прошло 60 сек и api Sora не появилось, отписываемся и резолвим false

            if (Date.now() - timespan > 60000) res(mockUnsub);
            else setTimeout(subscribeOnReady, 1000);
          });
      });
    });

    return unsubListPromises;
  }
}
