import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { isNetworkGroup } from './common';
import { type NetworkName } from '@/interfaces';

function networksIsPending(networks: NetworkJson[], selectedNetwork: NetworkName = 'all') {
  if (isNetworkGroup(selectedNetwork)) {
    //TODO добавить проверку по группам
    const isPendingExists = networks.some(({ networkStatus }) => networkStatus === NETWORK_STATUS.CONNECTING);

    return !navigator.onLine || isPendingExists;
  }

  const networkStatus = networks.find(
    ({ name }) => name.toLowerCase() === selectedNetwork.toLowerCase()
  )?.networkStatus;

  return networkStatus === NETWORK_STATUS.CONNECTING;
}

export { networksIsPending };
