import type { StakingStore } from '.';
import type { GetStakingNetworkProps, GetStakingParamsProps, SetAllStakingItems, SetMyStakingInfo } from './types';
import type { NetworkName } from '@/interfaces';
import { getStakingParams, getMyStakingInfo } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';
import { isSameString } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

const paramsRequests = new WeakMap<StakingStore, symbol>();
const infoRequests = new WeakMap<StakingStore, Map<NetworkName, symbol>>();
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

type Actions = {
  getStakingParams(this: StakingStore, props?: GetStakingParamsProps): Promise<void>;
  getMyStakingInfo(this: StakingStore, props: GetStakingNetworkProps): Promise<void>;
  updateMyStakingInfo(this: StakingStore, props: SetMyStakingInfo): void;
  updateStakingParams(this: StakingStore, props: SetAllStakingItems): void;
  clearStakingParams(this: StakingStore): void;
};

export const actions: Actions = {
  updateMyStakingInfo({ network, stakingInfo }) {
    const index = this.allStakingNetworks.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = this.allStakingNetworks[index];

    this.allStakingNetworks.splice(index, 1, {
      ...oldItem,
      ...stakingInfo,
    });

    this.allStakingNetworks = [...this.allStakingNetworks];
  },

  updateStakingParams(stakingParams) {
    stakingParams.forEach((params, index) => {
      const newItem = {
        ...this.allStakingNetworks[index],
        ...params,
        loading: false,
      };

      this.allStakingNetworks.splice(index, 1, newItem);
    });

    this.allStakingNetworks = [...this.allStakingNetworks];
  },

  clearStakingParams() {
    this.allStakingNetworks.forEach((item, index) => {
      this.allStakingNetworks.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    this.allStakingNetworks = [...this.allStakingNetworks];
  },

  async getStakingParams(props = { delay: 0 }) {
    const accountsStore = useAccountsStore();
    const address = accountsStore.selectedWallet.address;
    const request = Symbol();
    paramsRequests.set(this, request);
    const isCurrent = () => accountsStore.selectedWallet.address === address && paramsRequests.get(this) === request;
    this.clearStakingParams();

    await delay(props.delay);
    if (!isCurrent()) return;
    try {
      const networks = this.allStakingNetworks.map(({ network }) => network);
      const stakingParams = await getStakingParams({ networks });
      if (isCurrent()) this.updateStakingParams(stakingParams);
    } catch (error) {
      if (!isCurrent()) return;
      this.allStakingNetworks = this.allStakingNetworks.map((item) => ({ ...item, loading: false }));
      throw error;
    }
  },

  async getMyStakingInfo({ network }) {
    const accountsStore = useAccountsStore();
    const address = accountsStore.selectedWallet.address;
    const paramsRequest = paramsRequests.get(this);
    const requests = infoRequests.get(this) ?? new Map<NetworkName, symbol>();
    infoRequests.set(this, requests);
    const request = Symbol();
    requests.set(network, request);
    const isCurrent = () => accountsStore.selectedWallet.address === address &&
      requests.get(network) === request && paramsRequests.get(this) === paramsRequest;

    await delay(SEC1 * 10);
    if (!isCurrent()) return;
    try {
      const stakingInfo = await getMyStakingInfo({ network });
      if (isCurrent()) this.updateMyStakingInfo({ network, stakingInfo });
    } catch (error) {
      if (isCurrent()) throw error;
    }
  },
};
