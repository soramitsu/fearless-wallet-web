import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { Networks } from '@/store/networks/types';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import type { SelectedWallet } from '@/store/accounts/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export default class NetworksController {
  static getNetworks(): Networks {
    return store.getters[NetworksGettersTypes.getNetworks];
  }

  public static async loadNetworksInfo(): Promise<void> {
    const url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/v2/chains/chains.json';

    await store.dispatch(NetworksActionTypes.LOAD_NETWORKS, { url });
  }

  public static async loadAssetsInfo(): Promise<void> {
    const url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/ios/v2/chains/assets_dev.json';

    await store.dispatch(NetworksActionTypes.LOAD_ASSETS_INFO, { url });
  }

  public static async loadTokensPrice(): Promise<void> {
    await store.dispatch(NetworksActionTypes.LOAD_TOKENS_PRICE);
  }

  public static async subscribeToBalancesOfNetworks(accounts: SubjectInfo, loadHistory: boolean): Promise<void> {
    await store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, loadHistory });
  }

  public static formatAddress({ address, ethereumAddress }: SelectedWallet, networkName: string): string {
    const isEthereumNetwork = ETHEREUM_NETWORKS.includes(networkName);

    if (isEthereumNetwork) return ethereumAddress;

    const publicKey = decodeAddress(address, false);
    const networks = this.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    return encodeAddress(publicKey, prefix);
  }

  public static validateAddress(address: string): boolean {
    try {
      decodeAddress(address, false);

      return true;
    } catch {
      return false;
    }
  }
}
