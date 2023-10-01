import { Subject, Subscription } from 'rxjs';
import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import {
  CRON_AUTO_RECOVER_DOTSAMA_INTERVAL,
  CRON_GET_API_MAP_STATUS,
  CRON_REFRESH_PRICE_INTERVAL,
  CRON_UPDATE_JSON_INTERVAL,
} from '@extension-base/const/intervals';
import type FWState from '@extension-base/background/handlers/State';
import type { FWSubscription } from '@extension-base/background/handlers/subscriptions';
import type { ServiceInfo } from '@extension-base/background/types/types';

export class FWCron {
  subscriptions: FWSubscription;
  public status: 'pending' | 'running' | 'stopped' = 'pending';
  private serviceSubscription: Subscription | undefined;
  private state: FWState;
  private logger: Logger;
  private cronMap: Record<string, unknown> = {};
  private subjectMap: Record<string, Subject<any>> = {};

  constructor(state: FWState, subscriptions: FWSubscription) {
    this.subscriptions = subscriptions;
    this.state = state;
    this.logger = createLogger('Cron');
  }

  getCron = (name: string): unknown => {
    return this.cronMap[name];
  };

  getSubjectMap = (name: string): unknown => {
    return this.subjectMap[name];
  };

  addCron = (name: string, callback: (param?: unknown) => void, interval: number, runFirst = true) => {
    if (runFirst) callback();

    this.cronMap[name] = setInterval(callback, interval);
  };

  removeCron = (name: string) => {
    const interval = this.cronMap[name] as number;

    if (interval) {
      clearInterval(interval);

      delete this.cronMap[name];
    }
  };

  removeAllCrons = () => {
    Object.entries(this.cronMap).forEach(([key, interval]) => {
      clearInterval(interval as number);
      delete this.cronMap[key];
    });
  };

  init = () => {
    this.state.getCurrentAccount((currentAccount) => {
      if (!this.state.isReady) return;
      if (!currentAccount?.address) return;

      if (
        Object.keys(this.state.getSubstrateApiMap).length !== 0 ||
        Object.keys(this.state.getEvmApiMap).length !== 0
      ) {
        this.state.refreshPrice();
        this.updateApiMapStatus();
      }
    });
  };

  start = () => {
    if (this.status === 'running') return;

    this.logger.log('Starting cron jobs');

    this.addCron('refreshJsons', () => this.state.init(), CRON_UPDATE_JSON_INTERVAL, false);

    this.state.getCurrentAccount((currentAccount) => {
      if (!currentAccount?.address) return;

      if (
        Object.keys(this.state.getSubstrateApiMap).length !== 0 ||
        Object.keys(this.state.getEvmApiMap).length !== 0
      ) {
        this.addCron('refreshPrice', () => this.state.refreshPrice(), CRON_REFRESH_PRICE_INTERVAL);
        this.addCron('checkStatusApiMap', this.updateApiMapStatus, CRON_GET_API_MAP_STATUS);
        this.addCron('recoverApiMap', this.recoverApiMap, CRON_AUTO_RECOVER_DOTSAMA_INTERVAL, false);
      }
    });

    this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
      next: (serviceInfo) => {
        this.removeCron('refreshPrice');
        this.removeCron('checkStatusApiMap');
        this.removeCron('recoverApiMap');

        if (!serviceInfo.currentAccountInfo) return;

        if (this.checkNetworkAvailable(serviceInfo)) {
          // only add cron job if there's at least 1 active network

          this.addCron('refreshPrice', () => this.state.refreshPrice(), CRON_REFRESH_PRICE_INTERVAL);
          this.addCron('checkStatusApiMap', this.updateApiMapStatus, CRON_GET_API_MAP_STATUS);
          this.addCron('recoverApiMap', this.recoverApiMap, CRON_AUTO_RECOVER_DOTSAMA_INTERVAL, false);
        }
      },
    });

    this.status = 'running';
  };

  stop = () => {
    if (this.status === 'stopped') return;

    if (this.serviceSubscription) {
      this.serviceSubscription.unsubscribe();
      this.serviceSubscription = undefined;
    }

    this.logger.log('Stopping cron jobs');
    this.removeAllCrons();

    this.status = 'stopped';
  };

  recoverApiMap = async () => {
    if (!navigator.onLine) return;

    const { evm, substrate } = this.state.getApiMap;

    Object.keys(evm).forEach((network) => this.state.refreshWeb3Api(network));

    Object.entries(substrate).forEach(async ([network, apiProp]) => {
      if (!apiProp?.api?.isConnected) {
        await apiProp.api?.disconnect();

        this.state.refreshDotSamaApi(network);
      }
    });

    this.state.getCurrentAccount((currentAccount) => {
      if (!currentAccount) return;

      const { address, ethereumAddress } = currentAccount;

      this.subscriptions.subscribeBalances(address, ethereumAddress, null);
    });
  };

  updateApiMapStatus = async () => {
    const { evm, substrate } = this.state.getApiMap;

    Object.entries(substrate).forEach(([key, apiProp]) => {
      const status: NETWORK_STATUS = !navigator.onLine
        ? NETWORK_STATUS.DISCONNECTED
        : apiProp.api?.isConnected
        ? NETWORK_STATUS.CONNECTED
        : NETWORK_STATUS.CONNECTING;

      this.state.updateNetworkStatus(key, status);
    });

    Object.entries(evm).forEach(async ([key, api]) => {
      if (!navigator.onLine) this.state.updateNetworkStatus(key, NETWORK_STATUS.DISCONNECTED);
      else {
        try {
          await api.provider._waitUntilReady();

          this.state.updateNetworkStatus(key, NETWORK_STATUS.CONNECTED);
        } catch {
          this.state.updateNetworkStatus(key, NETWORK_STATUS.CONNECTING);
        }
      }
    });
  };

  checkNetworkAvailable = (serviceInfo: ServiceInfo): boolean => {
    return Object.keys(serviceInfo.apiMap.substrate).length > 0 || Object.keys(serviceInfo.apiMap.evm).length > 0;
  };
}
