import { logger as createLogger } from '@polkadot/util';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import {
  CRON_AUTO_RECOVER_DOTSAMA_INTERVAL,
  CRON_GET_API_MAP_STATUS,
  CRON_REFRESH_PRICE_INTERVAL,
  CRON_UPDATE_JSON_INTERVAL,
} from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';
import type { ServiceInfo } from '@extension-base/background/types/types';

export class CronService {
  private readonly logger = createLogger('Cron');
  private isRunning = false;
  private cronMap: Record<string, unknown> = {};

  constructor(private state: State) {}

  getCron(name: string) {
    return this.cronMap[name];
  }

  isCronExist(name: string) {
    return this.getCron(name) !== undefined;
  }

  addCron(name: string, callback: (param?: unknown) => void, interval: number, runFirst = true) {
    if (runFirst) callback();

    this.removeCron(name);

    this.cronMap[name] = setInterval(callback, interval);
  }

  removeCron(name: string) {
    const interval = this.cronMap[name] as number;

    if (interval) {
      clearInterval(interval);

      delete this.cronMap[name];
    }
  }

  removeAllCrons() {
    Object.entries(this.cronMap).forEach(([key, interval]) => {
      clearInterval(interval as number);

      delete this.cronMap[key];
    });
  }

  init() {
    if (!this.state.isReady) return;

    if (!this.state.currentAccount?.address) return;

    if (Object.keys(this.state.getSubstrateApiMap).length !== 0 || Object.keys(this.state.getEvmApiMap).length !== 0) {
      this.state.pricesService.refreshPrice();
      this.updateApiMapStatus();
    }
  }

  start() {
    if (this.isRunning) return;

    this.logger.log('Starting cron jobs');

    this.addCron('refreshJsons', () => this.state.init(), CRON_UPDATE_JSON_INTERVAL, false);

    if (!this.state.currentAccount?.address) return;

    if (Object.keys(this.state.getSubstrateApiMap).length !== 0 || Object.keys(this.state.getEvmApiMap).length !== 0) {
      this.addCron('refreshPrice', () => this.state.pricesService.refreshPrice(), CRON_REFRESH_PRICE_INTERVAL);
      this.addCron('checkStatusApiMap', () => this.updateApiMapStatus(), CRON_GET_API_MAP_STATUS);
      this.addCron('recoverApiMap', () => this.recoverApiMap(), CRON_AUTO_RECOVER_DOTSAMA_INTERVAL, false);
    }

    this.isRunning = true;
  }

  updateCron(serviceInfo: ServiceInfo) {
    this.logger.log('Update Crones');

    // Если не подключены ни к одной сети или нет выбранного аккаунта
    if (!serviceInfo.currentAccountInfo || !this.checkNetworkAvailable(serviceInfo)) {
      this.removeCron('refreshPrice');
      this.removeCron('checkStatusApiMap');
      this.removeCron('recoverApiMap');

      return;
    }

    if (!this.isCronExist('refreshPrice'))
      this.addCron('refreshPrice', () => this.state.pricesService.refreshPrice(), CRON_REFRESH_PRICE_INTERVAL);

    if (!this.isCronExist('checkStatusApiMap'))
      this.addCron('checkStatusApiMap', () => this.updateApiMapStatus(), CRON_GET_API_MAP_STATUS);

    if (!this.isCronExist('recoverApiMap'))
      this.addCron('recoverApiMap', () => this.recoverApiMap(), CRON_AUTO_RECOVER_DOTSAMA_INTERVAL, false);
  }

  stop() {
    this.logger.log('Stopping cron jobs');

    this.removeAllCrons();
  }

  recoverApiMap() {
    if (!navigator.onLine) return;

    const { evm, substrate } = this.state.networkService.getApiMap;

    Object.keys(evm).forEach((network) => this.state.networkService.evmApiHandler.refreshEvmApi(network));

    Object.entries(substrate).forEach(([network, apiProp]) => {
      if (!apiProp?.api?.isConnected) {
        apiProp.api?.disconnect().finally(() => {
          this.state.networkService.substrateApiHandler.refreshDotSamaApi(network);
        });
      }
    });
  }

  updateApiMapStatus() {
    this.logger.log('Check API statuses');

    const { evm, substrate } = this.state.networkService.getApiMap;

    Object.entries(substrate).forEach(([key, { apiStatus }]) => {
      this.state.networkService.updateNetworkStatus(key, apiStatus);
    });

    Object.entries(evm).forEach(([key, api]) => {
      if (!navigator.onLine) this.state.networkService.updateNetworkStatus(key, NETWORK_STATUS.DISCONNECTED);
      else {
        api.api?.provider
          ._waitUntilReady()
          .then(() => this.state.networkService.updateNetworkStatus(key, NETWORK_STATUS.CONNECTED))
          .catch(() => this.state.networkService.updateNetworkStatus(key, NETWORK_STATUS.CONNECTING));
      }
    });
  }

  checkNetworkAvailable(serviceInfo: ServiceInfo): boolean {
    return Object.keys(serviceInfo.apiMap.substrate).length > 0 || Object.keys(serviceInfo.apiMap.evm).length > 0;
  }
}
