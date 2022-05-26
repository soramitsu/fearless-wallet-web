import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { Networks } from '@/store/networks/types';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export default class NetworksController {
  private readonly networksUrl =
    'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/v2/chains/chains.json';

  private readonly assetsUrl =
    'https://raw.githubusercontent.com/soramitsu/fearless-utils/ios/v2/chains/assets_dev.json';

  private static getNetworks(): Networks {
    return store.getters[NetworksGettersTypes.getNetworksInfo];
  }

  public async loadNetworksInfo(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_NETWORKS_INFO, { url: this.networksUrl });
  }

  public async loadAssetsInfo(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_ASSETS_INFO, { url: this.assetsUrl });
  }

  public async loadTokensPrice(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_TOKENS_PRICE);
  }

  public async subscribeToBalancesOfNetworks(accounts: SubjectInfo): Promise<void> {
    await store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts });
  }

  public static formatAddress(address: string, networkName: string): string {
    const publicKey = decodeAddress(address, false);
    const networks = this.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    return encodeAddress(publicKey, prefix);
  }
}
