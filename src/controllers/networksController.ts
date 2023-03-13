import type { Wallet, CustomAccounts } from '@/store';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { AssetJson, Networks, Network, AssetPrice } from '@/interfaces';
import store from '@/store';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import URLS from '@/consts/urls';

export default class NetworksController {
  static getNetworks(): Networks {
    return store.getters[NetworksGettersTypes.getNetworks];
  }

  static getNetwork(networkName: string): Network {
    return store.getters[NetworksGettersTypes.getNetwork](networkName);
  }

  public static getAssetsJson(): AssetJson[] {
    return store.getters[NetworksGettersTypes.getAssetsJson];
  }

  public static getAssetIcon(assetId: string): string {
    return store.getters[NetworksGettersTypes.getAssetIcon](assetId);
  }

  public static getAssetPrice(assetId: string): AssetPrice {
    return store.getters[NetworksGettersTypes.getAssetPrice](assetId);
  }

  public static async connectToNodes(): Promise<void> {
    await store.dispatch(NetworksActionTypes.CONNECT_TO_NODES);
  }

  public static async fetchJsons(): Promise<void> {
    await store.dispatch(NetworksActionTypes.FETCH_JSONS, {
      chainsUrl: URLS.CHAINS,
      assetsUrl: URLS.ASSETS,
      fiatsUrl: URLS.FIATS,
    });

    await store.dispatch(NetworksActionTypes.FETCH_ASSETS_PRICE);
  }

  public static async fetchHistory(
    networkName: string,
    wallet: Wallet,
    assetId: string,
    isPreviously = false,
    delay?: number
  ): Promise<void> {
    if (delay !== undefined) {
      const timeout = delay * 1000;

      setTimeout(() => {
        store.dispatch(NetworksActionTypes.FETCH_HISTORY, { networkName, wallet, assetId, isPreviously });
      }, timeout);

      return;
    }

    await store.dispatch(NetworksActionTypes.FETCH_HISTORY, { networkName, wallet, assetId, isPreviously });
  }

  public static subscribeToBalancesOfNetworks(accounts: CustomAccounts, networksProps?: Networks): void {
    store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, networksProps });
  }

  public static async toggleActiveNode(
    network: string,
    nodeName?: string,
    nodeUrl?: string,
    oldNodeUrl?: string
  ): Promise<void> {
    await store.dispatch(NetworksActionTypes.TOGGLE_ACTIVE_NODE, { network, nodeName, nodeUrl, oldNodeUrl });
  }
}
