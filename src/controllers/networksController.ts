import type { AssetJson } from '@/interfaces/assets';
import type { Networks, Network } from '@/interfaces/networks';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { TokenPrice } from '@/interfaces/tokens';
import store from '@/store';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ASSETS_URL, FIATS_URL, CHAINS_URL } from '@/consts/urls';

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

  public static getTokenPrice(assetId: string): TokenPrice {
    return store.getters[NetworksGettersTypes.getTokenPrice](assetId);
  }

  public static async connectToNodes(): Promise<void> {
    await store.dispatch(NetworksActionTypes.CONNECT_TO_NODES);
  }

  public static async loadJsons(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_JSONS, {
      chainsUrl: CHAINS_URL,
      assetsUrl: ASSETS_URL,
      fiatsUrl: FIATS_URL,
    });

    await store.dispatch(NetworksActionTypes.LOAD_TOKENS_PRICE);
  }

  public static async loadHistory(
    networkName: string,
    walletAddress: string,
    assetId: string,
    delay: number
  ): Promise<void> {
    if (delay !== 0) {
      const timeout = delay * 1000;

      setTimeout(() => {
        store.dispatch(NetworksActionTypes.LOAD_HISTORY, { networkName, walletAddress, assetId });
      }, timeout);

      return;
    }

    await store.dispatch(NetworksActionTypes.LOAD_HISTORY, { networkName, walletAddress, assetId });
  }

  public static async subscribeToBalancesOfNetworks(accounts: SubjectInfo): Promise<void> {
    await store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts });
  }

  public static async toggleActiveNode(
    network: string,
    nodeName: string,
    nodeUrl: string,
    oldNodeUrl: string
  ): Promise<void> {
    await store.dispatch(NetworksActionTypes.TOGGLE_ACTIVE_NODE, { network, nodeName, nodeUrl, oldNodeUrl });
  }
}
