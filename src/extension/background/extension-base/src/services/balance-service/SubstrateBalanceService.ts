import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate';
import { getSoraUtil, getSoraUtilOrThrow } from '@extension-base/services/utils/sora';
import EquilibriumBalanceService from './EquilibriumBalanceService';
import type { CodecString } from '@sora/math';
import type { ApiPromise } from '@polkadot/api';
import type { Subscription } from 'rxjs';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { u128 } from '@polkadot/types-codec';
import type { FetchBalancePayload, ResponseBalanceRequest } from '../../background/types/types';
import type { GetBalancesProps } from '../subscription-service';
import type { OrmlAccountDataLike } from '@/types/polkadot';
import type State from '@extension-base/background/handlers/State';
import { WalletEcosystem, type RelayChainName, type NetworkName } from '@/interfaces';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS, EQUILIBRIUM } from '@/consts/networks';
import { SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/sora';
import { isSameString, isSora } from '@/helpers';
import {
  BALANCE_FETCH_TTL_MS,
  markBalanceFetch,
  resolveBalanceAddress,
  shouldSkipBalanceFetch,
} from '@/helpers/balances';

const ensureSoraLoaded = async () => getSoraUtil();

const getSoraOrThrow = () => getSoraUtilOrThrow();

const mockUnsubFn = () => {};

type ObservableLike<T> = {
  subscribe: (callback: (value: T) => void) => Subscription;
};

type BalanceCodec = {
  toJSON?: () => { balance?: CodecString };
  data?: AccountData | OrmlAccountDataLike | u128;
};

export default class SubstrateBalanceService {
  private readonly equilibriumBalanceService: EquilibriumBalanceService;

  constructor(private readonly state: State) {
    this.equilibriumBalanceService = new EquilibriumBalanceService(state);
  }

  async fetchBalance({
    address,
    ethereumAddress,
    networks = [],
    force,
  }: FetchBalancePayload): Promise<ResponseBalanceRequest[]> {
    const { FPNumber } = await ensureSoraLoaded();
    const registry = this.state.balanceService.lookupRegistry;
    const promises = networks.map(async (networkKey) => {
      const api = this.state.getSubstrateApiMap[networkKey.toLowerCase()]?.api;

      const {
        parentId,
        name: networkName,
        assets,
      } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, networkKey))!;

      const lookupAddress = resolveBalanceAddress(networkKey, {
        substrate: address,
        ethereum: ethereumAddress,
      });

      if (!lookupAddress) return [];

      const skipFetch = shouldSkipBalanceFetch({
        lookup: registry,
        ecosystem: WalletEcosystem.Substrate,
        network: networkName,
        address: lookupAddress,
        ttl: BALANCE_FETCH_TTL_MS,
        force,
      });

      if (skipFetch) return [];

      markBalanceFetch({
        lookup: registry,
        ecosystem: WalletEcosystem.Substrate,
        network: networkName,
        address: lookupAddress,
      });

      if (isSameString(networkName, EQUILIBRIUM)) {
        if (!api) return [];

        return this.equilibriumBalanceService.fetchBalance(address!, api);
      }

      const assetsPromises = assets.map(async ({ precision, symbol, id, type }) => {
        const options = getAssetOptions(id, this.state.networkService.assetsMap);
        const assetOptions = (options ?? id) as unknown;

        const addressByNetwork = lookupAddress;

        const query = api?.query;

        if (!query) return { balance: '0', network: networkKey, assetId: id };

        let response;

        const isSoraXOR =
          symbol === SORA_UTILITY_ASSET &&
          (isSameString(networkKey, SORA_MAINNET) || isSameString(networkKey, SORA_TEST));

        if (type === 'normal' || isSoraXOR) {
          response = query.system.account(addressByNetwork);
        } else if (type === 'assets') {
          const assetsModule = query.assets as unknown as {
            account: (asset: unknown, address: string) => Promise<unknown>;
          };

          response = assetsModule.account(assetOptions as never, addressByNetwork);
        } else {
          response = query.tokens.accounts(addressByNetwork, assetOptions as never);
        }

        const balances = (await response) as BalanceCodec;
        const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

        if (type === 'assets') {
          const balancesJson = balances.toJSON?.() as { balance?: CodecString } | undefined;
          const free = FPNumber.fromCodecValue(balancesJson?.balance ?? 0, precision).toString();

          this.state.balanceService.setBalanceItem(
            networkName,
            {
              state: APIItemState.READY,
              relayChain,
              symbol,
              id,
              reserved: '0',
              frozen: '0',
              total: free,
              locked: '0',
              transferable: free,
            },
            address!
          );

          return {
            balance: free,
            network: networkKey,
            assetId: id,
          };
        }

        const balanceData = (balances.data ?? (balances as AccountData | OrmlAccountDataLike | u128)) as
          | AccountData
          | OrmlAccountDataLike
          | u128;

        const { frozen, locked, reserved, total, transferable } = formatBalance(balanceData, precision);

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
    const { FPNumber } = getSoraOrThrow();
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
        const assetOptions = (options ?? id) as unknown;

        if (!api || !api.rx) return () => null;

        const query = api.rx.query;

        const isSoraXOR = symbol === SORA_UTILITY_ASSET && isSora(networkName, true);

        const assetsAccountQuery = query.assets as unknown as {
          account: (
            assetId: unknown,
            account: string
          ) => ObservableLike<BalanceCodec | AccountData | OrmlAccountDataLike | u128>;
        };

        const pallet =
          type === 'normal' || isSoraXOR
            ? query.system.account(address ?? '')
            : type === 'assets'
              ? assetsAccountQuery.account(assetOptions as never, address ?? '')
              : query.tokens?.accounts(address, assetOptions as never);

        const onBalanceFetch = (balances: BalanceCodec | AccountData | OrmlAccountDataLike | u128) => {
          const codec = balances as BalanceCodec;
          const balanceJson = codec.toJSON?.();
          const balanceValue = (balanceJson?.balance ?? 0) as CodecString;

          const balanceData =
            type === 'assets'
              ? ({
                  free: FPNumber.fromCodecValue(balanceValue, precision),
                } as unknown as AccountData)
              : ((codec.data ?? balances) as AccountData | OrmlAccountDataLike | u128);

          const { frozen, locked, reserved, total, transferable } = formatBalance(balanceData, precision);
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

        const observable = pallet as
          | ObservableLike<BalanceCodec | AccountData | OrmlAccountDataLike | u128>
          | undefined;
        const subscription = observable?.subscribe(onBalanceFetch);

        return () => subscription?.unsubscribe();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
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

        console.warn(message, networkKey);

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

        const addressByNetwork = resolveBalanceAddress(networkName, {
          substrate: address,
          ethereum: ethereumAddress,
        });

        if (!addressByNetwork) return mockUnsub;

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
            .then(async () => {
              await ensureSoraLoaded();
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
          .then(async () => {
            await ensureSoraLoaded();
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
