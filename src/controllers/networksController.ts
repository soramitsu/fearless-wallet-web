import type { Network } from '@/interfaces';
import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

// TODO Когда будет возможность- полностью удалить NetworksController
export class NetworksController {
  static getNetwork(networkName: string): Network {
    return store.getters[NetworksGettersTypes.getNetwork](networkName);
  }
}
