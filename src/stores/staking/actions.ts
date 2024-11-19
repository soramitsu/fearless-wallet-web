import type { StakingStore } from '.';
import type { GetStakingNetworkProps, GetStakingParamsProps, SetAllStakingItems, SetMyStakingInfo } from './types';
import { getStakingParams, getMyStakingInfo } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';
import { isSameString } from '@/helpers';

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
    this.clearStakingParams();

    await new Promise((res) => {
      setTimeout(async () => {
        const networks = this.allStakingNetworks.map(({ network }) => network);
        const stakingParams = await getStakingParams({ networks });

        this.updateStakingParams(stakingParams);

        res(true);
      }, props.delay);
    });
  },

  async getMyStakingInfo({ network }) {
    setTimeout(async () => {
      const stakingInfo = await getMyStakingInfo({ network });

      this.updateMyStakingInfo({ network, stakingInfo });
    }, SEC1 * 10);
  },
};
