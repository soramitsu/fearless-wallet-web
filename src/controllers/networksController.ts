import type { Networks } from '@/store/networks/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import store from '@/store';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ASSETS_URL, FIATS_URL, NETWORKS_URL } from '@/consts/urls';

export default class NetworksController {
  static getNetworks(): Networks {
    return store.getters[NetworksGettersTypes.getNetworks];
  }

  public static async loadNetworks(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_NETWORKS, { url: NETWORKS_URL });
  }

  public static async loadAssets(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_ASSETS, { url: ASSETS_URL });
  }

  public static async loadFiats(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_FIATS, { url: FIATS_URL });
  }

  public static async loadTokensPrice(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_TOKENS_PRICE);
  }

  public static async subscribeToBalancesOfNetworks(accounts: SubjectInfo, loadHistory: boolean): Promise<void> {
    await store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, loadHistory });
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
