import store from '@/store';
import { GettersTypes as ApiGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ApiActionTypes } from '@/store/networks/actions';
import { MutationTypes as ApiMutationTypes } from '@/store/networks/mutations';
import { getNetworkInfo } from '@/store/helpers';

import { Networks, SetNetworkStatusProps } from '@/store/networks/types';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export default class NetworksController {
  private readonly url =
    'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';

  private static getNetworks(): Networks {
    return store.getters[ApiGettersTypes.getNetworksInfo];
  }

  private setNetworkStatus(props: SetNetworkStatusProps): void {
    store.commit(ApiMutationTypes.SET_NETWORK_STATUS, props);
  }

  public async loadNetworksInfo(): Promise<void> {
    await store.dispatch(ApiActionTypes.LOAD_NETWORKS_INFO, { url: this.url });
  }

  public async subscribeToBalancesOfNetworks(accounts: SubjectInfo): Promise<void> {
    await store.dispatch(ApiActionTypes.SUBSCRIBE_TO_BALANCES, { accounts });
  }

  public static formatAddress(address: string, networkName: string): string {
    const publicKey = decodeAddress(address, false);
    const networks = this.getNetworks();

    const network = getNetworkInfo(networks, networkName);

    const prefix = network?.addressPrefix;

    return encodeAddress(publicKey, prefix);
  }
}
