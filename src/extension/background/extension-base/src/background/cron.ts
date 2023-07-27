// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

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
import { NetworkJson } from '@extension-base/types';
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
    if (runFirst) {
      callback();
    }

    this.cronMap[name] = setInterval(callback, interval);
  };

  addSubscribeCron = <T>(name: string, callback: (subject: Subject<T>) => void, interval: number) => {
    const sb = new Subject<T>();

    callback(sb);
    this.subjectMap[name] = sb;
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
    this.state.getCurrentAccount((currentAccountInfo) => {
      if (!this.state.isReady) return;
      if (!currentAccountInfo?.address) return;

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

    this.state.getCurrentAccount((currentAccountInfo) => {
      if (!currentAccountInfo?.address) return;

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

    navigator.connection.removeEventListener('change', () => {
      this.onConnectionChange();
    });

    navigator.connection.addEventListener('change', () => {
      this.onConnectionChange();
    });

    this.status = 'running';
  };

  onConnectionChange() {
    if (navigator.onLine) {
      this.logger.log('Extension is back online');

      this.start();
    } else {
      this.logger.log('Extension is offline');

      this.stop();
    }
  }

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

  recoverApiMap = () => {
    const apiMap = this.state.getApiMap;

    for (const [key] of Object.entries(apiMap.evm)) {
      this.state.refreshWeb3Api(key);
    }

    for (const [key, substrate] of Object.entries(apiMap.substrate)) {
      substrate.api?.isReadyOrError.catch(() => {
        this.state.refreshDotSamaApi(key);
      });
    }

    this.state.getCurrentAccount((account) => {
      if (!account) return;

      const { address, ethereumAddress } = account;

      this.subscriptions.subscribeBalances(address, ethereumAddress);
    });
  };

  updateApiMapStatus = () => {
    const apiMap = this.state.getApiMap;
    const networkMap = this.state.getNetworkMap;

    for (const [key, apiProp] of Object.entries(apiMap.substrate)) {
      if (apiProp.isEthereumOnly) continue;

      let status: NETWORK_STATUS = NETWORK_STATUS.CONNECTING;

      if (apiProp.isApiConnected) status = NETWORK_STATUS.CONNECTED;

      if (!networkMap[key].apiStatus) this.state.updateNetworkStatus(key, status);
      else if (networkMap[key].apiStatus && networkMap[key].apiStatus !== status) {
        this.state.updateNetworkStatus(key, status);
      }
    }

    for (const [key, evm] of Object.entries(apiMap.evm)) {
      const apiStatus = networkMap[key].apiStatus;

      evm
        ._waitUntilReady()
        .then(() => {
          if (!apiStatus) this.state.updateNetworkStatus(key, NETWORK_STATUS.CONNECTED);
          else if (apiStatus !== NETWORK_STATUS.CONNECTED) {
            this.state.updateNetworkStatus(key, NETWORK_STATUS.CONNECTED);
          }
        })
        .catch(() => {
          if (!apiStatus || apiStatus !== NETWORK_STATUS.CONNECTING) {
            this.state.updateNetworkStatus(key, NETWORK_STATUS.CONNECTING);
          }
        });
    }
  };

  checkNetworkAvailable = (serviceInfo: ServiceInfo): boolean => {
    return Object.keys(serviceInfo.apiMap.substrate).length > 0 || Object.keys(serviceInfo.apiMap.evm).length > 0;
  };

  getActiveContractSupportedNetworks = (networkMap: Record<string, NetworkJson>): Record<string, NetworkJson> => {
    const contractSupportedNetworkMap: Record<string, NetworkJson> = {};

    Object.entries(networkMap).forEach(([key, network]) => {
      if (network.active && network.supportSmartContract && network.supportSmartContract.length > 0) {
        contractSupportedNetworkMap[key] = network;
      }
    });

    return contractSupportedNetworkMap;
  };
}
