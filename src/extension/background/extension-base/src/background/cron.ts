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
import type { ServiceInfo } from '@extension-base/background/types';

export class FWCron {
  public status: 'pending' | 'running' | 'stopped' = 'pending';
  private state: FWState;
  private logger: Logger;
  private cronMap: Record<string, unknown> = {};

  constructor(state: FWState) {
    this.state = state;
    this.logger = createLogger('Cron');
  }

  getCron(name: string) {
    return this.cronMap[name];
  }

  isCronExist(name: string) {
    return this.getCron(name) !== undefined;
  }

  addCron = (name: string, callback: (param?: unknown) => void, interval: number, runFirst = true) => {
    if (runFirst) callback();

    this.removeCron(name);

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

    this.status = 'running';
  };

  updateCron(serviceInfo: ServiceInfo) {
    // Если не подключены ни к одной сети или нет выбранного аккаунта
    if (!serviceInfo.currentAccountInfo || !this.checkNetworkAvailable(serviceInfo)) {
      this.removeCron('refreshPrice');
      this.removeCron('checkStatusApiMap');
      this.removeCron('recoverApiMap');

      return;
    }

    if (!this.isCronExist('refreshPrice'))
      this.addCron('refreshPrice', () => this.state.refreshPrice(), CRON_REFRESH_PRICE_INTERVAL);

    if (!this.isCronExist('checkStatusApiMap'))
      this.addCron('checkStatusApiMap', this.updateApiMapStatus, CRON_GET_API_MAP_STATUS);

    if (!this.isCronExist('recoverApiMap'))
      this.addCron('recoverApiMap', this.recoverApiMap, CRON_AUTO_RECOVER_DOTSAMA_INTERVAL, false);
  }

  stop = () => {
    if (this.status === 'stopped') return;

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
  };

  updateApiMapStatus = async () => {
    const { evm, substrate } = this.state.getApiMap;

    Object.entries(substrate).forEach(([key, { apiStatus }]) => {
      this.state.updateNetworkStatus(key, apiStatus);
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
