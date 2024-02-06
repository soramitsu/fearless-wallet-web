import { Subject } from 'rxjs';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { type NetworkJson } from '@extension-base/types';
import { type NETWORK_STATUS } from '@extension-base/api/types/networks';

export class NetworkService {
  private networkMapSubject: Subject<Record<string, NetworkJson>>;
  readonly networkMapStore: NetworkMapStore; // persist custom networkMap by user
  public networksGithub: NetworkJson[] = []; // networks from github
  public networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background

  constructor() {
    this.networkMapSubject = new Subject<Record<string, NetworkJson>>();
    this.networkMapStore = new NetworkMapStore();
  }

  updateNetworks() {
    this.networkMapSubject.next(this.networkMap);
    this.updateNetworkStore();
  }

  getStoredNetworks(): Promise<Record<string, NetworkJson> | undefined> {
    return new Promise<Record<string, NetworkJson>>((res) => {
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => {
        res(accountsFromStorage);
      });
    });
  }

  updateNetworkStore() {
    this.networkMapStore.set('NetworkMap', this.networkMap);
  }

  subscribeNetworkMap() {
    return this.networkMapStore.subject;
  }

  getNetworkGenesisHashByKey(key: string): string {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  get networkValues() {
    return Object.values(this.networkMap);
  }

  getNetworkByKey(key: string): NetworkJson {
    return this.networkValues.find((network) => network.name.toLowerCase() === key.toLowerCase())!;
  }

  updateNetworkStatus(key: string, status: NETWORK_STATUS) {
    const networkKey = this.getNetworkByKey(key)?.name ?? '';

    if (this.networkMap[networkKey].networkStatus === status) return;

    this.networkMap[networkKey].networkStatus = status;

    this.updateNetworks();
  }
}
