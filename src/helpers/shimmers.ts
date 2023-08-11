import { ALL_NETWORKS } from '@/consts/networks';
import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NETWORK_STATUS } from '@/extension/background/extension-base/src/api/types/networks';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

function getShimmersVisibility() {
  const selectedNetwork: string = store.getters[AccountsGettersTypes.selectedNetwork];
  const isOnline: boolean = store.getters[AccountsGettersTypes.isOnline];
  const networks: NetworkJson[] = store.getters[NetworksGettersTypes.networks];

  if (selectedNetwork !== ALL_NETWORKS) {
    const apiStatus = networks.find(({ name }) => name.toLowerCase() === selectedNetwork.toLowerCase())?.apiStatus;

    return apiStatus === NETWORK_STATUS.PENDING;
  }

  const isPendingExists = networks.some(({ apiStatus }) => apiStatus === NETWORK_STATUS.PENDING);

  return !isOnline || isPendingExists;
}

export { getShimmersVisibility };
