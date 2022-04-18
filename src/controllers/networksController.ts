import store from '../store';
import { GettersTypes as ApiGettersTypes } from '../store/api/getters';
import { ActionTypes as ApiActionTypes } from '../store/api/actions';
import { MutationTypes as ApiMutationTypes } from '../store/api/mutations';
import { Networks, SetNetworkStatusMutation } from '../store/api/types';
import { formatBalance } from '../util/balances';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { AccountData } from '@polkadot/types/interfaces/balances';

export default class NetworksController {
  private readonly url =
    'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';

  private getNetworks(): Networks {
    return store.getters[ApiGettersTypes.getNetworksInfo];
  }

  private setNetworkStatus(props: SetNetworkStatusMutation): void {
    store.commit(ApiMutationTypes.SET_NETWORK_STATUS, props);
  }

  async loadNetworksInfo(): Promise<void> {
    await store.dispatch(ApiActionTypes.LOAD_NETWORKS_INFO, { url: this.url });
  }

  async subscribeToNetworks(accounts: SubjectInfo): Promise<void> {
    console.log('accounts', accounts);
    console.log('networks', this.getNetworks());

    for (const [netName, { api, isEthereumNetwork }] of Object.entries(this.getNetworks())) {
      await api.isReady;

      try {
        Object.entries(accounts).forEach(([address, { type }]) => {
          // ethereum accounts only subscribe to the ethereum networks
          if ((!isEthereumNetwork && type === 'ethereum') || (isEthereumNetwork && type !== 'ethereum')) return;

          api.rx.query.balances.account(address).subscribe(async (result) => {
            const balances = formatBalance(result as AccountData);
            const nullBalances = !Object.values(balances).find((value) => value !== '0');

            console.log(
              `
              Address: ${address},
              Network: ${netName},
              `,
              balances
            );

            if (nullBalances) {
              api.disconnect();

              this.setNetworkStatus({ name: netName, isActive: false });
            }
          });
        });
      } catch (ex) {
        console.log(
          `
          Subscribe to ${netName.toUpperCase()} failed
          ${ex}
          `
        );
      }
    }
  }
}
