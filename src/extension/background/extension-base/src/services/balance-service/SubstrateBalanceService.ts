import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getAssetOptions } from '@extension-base/api/substrate';
import EquilibriumBalanceService from './EquilibriumBalanceService';
import type { ApiPromise } from '@polkadot/api';
import type { Subscription } from 'rxjs';
import type { FetchBalancePayload, ResponseBalanceRequest } from '../../background/types/types';
import type { GetBalancesProps } from '../subscription-service';
import type State from '@extension-base/background/handlers/State';
import type { RelayChainName, NetworkName } from '@/interfaces';
import { FPNumber } from '@/sora/number';
import { isEthereumNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { formatBalance } from '@/util/balances';
import { CHAIN_IDS } from '@/consts/networks';
import { SORA_MAINNET, SORA_TEST, SORA_UTILITY_ASSET } from '@/consts/sora';
import { isSameString, isSora } from '@/helpers';

const mockUnsubFn = () => {};
type BalanceData = Parameters<typeof formatBalance>[0];
type CodecValue = string | number | bigint;
type AssetBalanceResponse = {
  data?: BalanceData;
  toJSON?: () => { balance?: unknown } | null;
};
type SubscribableBalanceQuery = {
  subscribe(observer: { next: (balances: unknown) => void; error: (error: unknown) => void }): Subscription;
};
type StorageEntry<T> = {
  (...args: unknown[]): T;
  key(...args: unknown[]): string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toCodecValue(value: unknown): CodecValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;

  return 0;
}

// The storage entry and arguments that read one asset's balance. The entry is missing when the chain has no such pallet.
function balanceStorage<T>(
  query: unknown,
  native: boolean,
  type: string | undefined,
  address: string,
  options: unknown
): [StorageEntry<T> | undefined, unknown[]] {
  const pallets = query as Record<string, Record<string, StorageEntry<T> | undefined> | undefined>;

  if (native) return [pallets.system?.account, [address]];
  if (type === 'assets') return [pallets.assets?.account, [options, address]];

  return [pallets.tokens?.accounts, [address, options]];
}

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

      const network = Object.values(this.state.networkService.networkMap)
        .find(({ name }) => isSameString(name, networkKey));
      if (!network) return [];
      const {
        parentId,
        name: networkName,
        assets,
      } = network;

      const assetsPromises = assets.map(async ({ precision, symbol, id, type }) => {
        const options = getAssetOptions(id, this.state.networkService.assetsMap);

        const addressByNetwork = isEthereumNetwork(networkKey) ? ethereumAddress! : address!;

        const query = api?.query;

        if (!query) return undefined;

        const isSoraXOR =
          symbol === SORA_UTILITY_ASSET &&
          (isSameString(networkKey, SORA_MAINNET) || isSameString(networkKey, SORA_TEST));

        const [entry, args] = balanceStorage<Promise<unknown>>(
          query, type === 'normal' || isSoraXOR, type, addressByNetwork, options
        );

        // ApiPromise exposes an empty query object before metadata is available. It proves no balance.
        if (!entry) return undefined;
        // Keys asked for in one tick are read together, so one this chain cannot encode would fail the others.
        entry.key(...args);

        const balances = await entry(...args);
        const balanceResponse = balances as AssetBalanceResponse;

        const balance = (
          type === 'assets'
            ? {
                free: FPNumber.fromCodecValue(toCodecValue(balanceResponse.toJSON?.()?.balance), precision),
              }
            : balanceResponse.data ?? balanceResponse
        ) as BalanceData;

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

      return (await Promise.all(assetsPromises)).filter((balance) => balance !== undefined);
    });

    return (await Promise.all(promises)).flat();
  }

  subscribeSubstrateAssetsBalances(address: string, networkKey: NetworkName, api: ApiPromise, state: State) {
    const network = Object.values(state.networkService.networkMap).find(({ name }) => isSameString(name, networkKey));
    if (!network) return mockUnsubFn;
    const {
      parentId,
      assets,
      name: networkName,
    } = network;

    const relayChain = CHAIN_IDS[parentId!] ?? (networkName as RelayChainName);

    if (networkName === 'Equilibrium') return this.equilibriumBalanceService.subscribeBalance(address, api);

    const unsubList = assets.map(({ precision, symbol, id, type }) => {
      // An error keeps a cached amount but no longer shows it as current (setBalanceItem).
      const setFailed = (err: unknown) => {
        state.balanceService.setBalanceItem(
          networkKey,
          {
            state: APIItemState.ERROR,
            relayChain,
            symbol,
            id,
          },
          state.keyringService.getSubstrateAddress(address)
        );

        console.warn(getErrorMessage(err), networkKey);
      };

      try {
        const options = getAssetOptions(id, state.networkService.assetsMap);

        if (!api || !api.rx) return () => null;

        const isSoraXOR = symbol === SORA_UTILITY_ASSET && isSora(networkName, true);

        const [entry, args] = balanceStorage<SubscribableBalanceQuery>(
          api.rx.query, type === 'normal' || isSoraXOR, type, address ?? '', options
        );

        if (!entry) throw new Error(`${networkName} has no balance storage for ${symbol}`);
        // The API subscribes to the keys asked for in one tick together, so one key this chain cannot encode
        // (Pendulum's tokens take no symbol) failed every balance of the network. Encoding it first fails only this one.
        entry.key(...args);

        const onBalanceFetch = (balances: unknown) => {
          const balanceResponse = balances as AssetBalanceResponse;
          const balance = (
            type === 'assets'
              ? {
                  free: FPNumber.fromCodecValue(toCodecValue(balanceResponse.toJSON?.()?.balance), precision),
                }
              : balanceResponse.data ?? balanceResponse
          ) as BalanceData;

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

        // A failed subscription sends nothing more, so without an error state the network would stay pending.
        const sub = entry(...args).subscribe({ next: onBalanceFetch, error: setFailed });

        return () => sub.unsubscribe();
      } catch (err: unknown) {
        setFailed(err);

        return mockUnsubFn;
      }
    });

    return () => unsubList.forEach((unsubscribe) => unsubscribe());
  }

  subscribeSubstrateBalances(
    props: GetBalancesProps,
    state: State,
    isCurrent: (network: string) => boolean = () => true
  ) {
    const { address, ethereumAddress, substrateNetworks } = props;
    const networks = Object.entries(state.getSubstrateApiMap).filter(([name]) =>
      substrateNetworks?.some((network) => isSameString(network, name))
    );

    return networks.map(([networkName, apiProps]) => new Promise<{ networkName: string; unsub: () => void }>((resolve) => {
      const account = isEthereumNetwork(networkName) ? ethereumAddress : address;
      if (!account) { resolve({ networkName, unsub: mockUnsubFn }); return; }
      let settled = false;
      let retry: ReturnType<typeof setTimeout> | undefined;
      const finish = (unsub = mockUnsubFn) => {
        if (settled) { unsub(); return; }
        settled = true;
        clearTimeout(retry);
        clearTimeout(deadline);
        resolve({ networkName, unsub });
      };
      const ownsConnection = () => isCurrent(networkName) && state.getSubstrateApiMap[networkName] === apiProps;
      const subscribeOnReady = () => {
        if (settled || !ownsConnection()) { finish(); return; }
        const api = apiProps.api;
        if (!api) {
          const network = Object.values(state.networkService.networkMap).find(({ name }) => isSameString(name, networkName));
          if (network?.networkStatus === NETWORK_STATUS.DISCONNECTED) finish();
          else retry = setTimeout(subscribeOnReady, 1000);
          return;
        }
        void api.isReadyOrError.then(() => {
          if (settled || !ownsConnection() || apiProps.api !== api) { finish(); return; }
          finish(this.subscribeSubstrateAssetsBalances(account, networkName, api, state));
        }).catch(() => finish());
      };

      const deadline = setTimeout(() => finish(), 60_000);
      if (isSora(networkName)) subscribeOnReady();
      else retry = setTimeout(subscribeOnReady, 1000);
    }));
  }
}
