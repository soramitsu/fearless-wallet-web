import { NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { ALL_NETWORKS } from '@/consts/networks';
import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

function getShimmersVisibility() {
  const selectedNetwork: string = store.getters[AccountsGettersTypes.selectedNetwork];
  const networks: NetworkJson[] = store.getters[NetworksGettersTypes.networks];

  if (selectedNetwork !== ALL_NETWORKS) {
    const apiStatus = networks.find(({ name }) => name.toLowerCase() === selectedNetwork.toLowerCase())?.apiStatus;

    return apiStatus === NETWORK_STATUS.PENDING;
  }

  const isPendingExists = networks.some(({ apiStatus }) => apiStatus === NETWORK_STATUS.PENDING);

  return isPendingExists;
}

export { getShimmersVisibility };
