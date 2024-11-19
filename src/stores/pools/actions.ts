import type { PoolStore } from '.';
import type { GetPoolsParamsProps, SetAllPoolsItems, StatePoolParams } from './types';
import { POOLS_NETWORKS_LIST } from '@/stores/pools/state';
import { getPoolsParams } from '@/extension/messaging';
import { accountController } from '@/controllers';

type Actions = {
  getPoolsParams(this: PoolStore, props?: GetPoolsParamsProps): Promise<void>;
  hidePoolsBanner(this: PoolStore): void;
  clearPoolsParams(this: PoolStore): void;
  updatePoolsParams(this: PoolStore, props: SetAllPoolsItems): void;
};

export const actions: Actions = {
  updatePoolsParams(poolParams) {
    poolParams.forEach((params, index) => {
      const newItem: StatePoolParams = {
        ...this.allPoolsItems[index],
        ...params,
        loading: false,
      };

      this.$state.allPoolsItems.splice(index, 1, newItem);
    });

    this.$state.allPoolsItems = [...this.allPoolsItems];
  },

  clearPoolsParams() {
    this.allPoolsItems.forEach((item, index) => {
      this.allPoolsItems.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    this.$state.allPoolsItems = [...this.allPoolsItems];
  },

  hidePoolsBanner() {
    accountController.setHidingPoolsBanner();

    this.showPoolsBanner = false;
  },

  async getPoolsParams(props = { delay: 0 }) {
    this.clearPoolsParams();

    await new Promise((res) => {
      setTimeout(async () => {
        const poolParams = await getPoolsParams({ networks: POOLS_NETWORKS_LIST });

        this.updatePoolsParams(poolParams);

        res(true);
      }, props.delay);
    });
  },
};
