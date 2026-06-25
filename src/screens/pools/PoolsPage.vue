<template>
  <AboveForm header="pools.liquidityPools" :fullScreen="true" @closeHandler="closeForm">
    <div class="pools">
      <PoolsSettings
        :activeTabName="activeTabName"
        :filterValue="filterValue"
        :showPoolsItems="showPoolsItems"
        :showMyPoolsItems="showMyPoolsItems"
        @update:filterValue="updateFilterValue"
        @update:activeTabName="updateActiveTabName"
      />

      <ContentForm :height="460">
        <div class="content">
          <Loader v-if="showLoader" />

          <div v-else-if="noPoolsItems" class="no-pools">{{ $t('pools.noPools') }}</div>
          <template v-else>
            <Scroll>
              <template v-if="haveFilteredItems">
                <template v-if="isAllTab">
                  <PoolItem
                    v-for="item in filteredPoolsItems"
                    :key="getKey(item)"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>

                <template v-else>
                  <PoolItem
                    v-for="item in filteredMyPoolsItems"
                    :key="getKey(item)"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>
              </template>

              <div v-else class="nothing-found" data-testid="nothingFound">{{ $t('common.nothingFound') }}</div>
            </Scroll>
          </template>
        </div>
      </ContentForm>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { type AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import type { PoolsTab } from '@/interfaces';
import type { PoolParams } from '@/stores';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import PoolsSettings from '@/screens/pools/PoolsSettings.vue';
import PoolItem from '@/screens/pools/PoolItem.vue';
import { isSubstrString } from '@/helpers';
import { Components } from '@/router/routes';
import { subscribeAccountLiquidity, unsubscribePools } from '@/extension/messaging';
import { usePoolsStore } from '@/stores/pools';

export default defineComponent({ name: 'PoolsPage',
  components: {
    PoolItem,
    PoolsSettings,
  },
  data() {
    return {
      activeTabName: '',
      filterValue: '',
      isLoading: false,
      poolsStore: usePoolsStore(),
    };
  },
  computed: {
    filteredPoolsItems() {
      if (this.filterValue === '') return this.poolsStore.poolsItems;

          return this.poolsStore.poolsItems.filter(
            ({ asset1: { name: name1 }, asset2: { name: name2 } }) =>
              isSubstrString(`${name1}${name2}`, this.filterValue) || isSubstrString(`${name1}-${name2}`, this.filterValue)
          );
    },
    filteredMyPoolsItems() {
      if (this.filterValue === '') return this.poolsStore.myPoolsItems;

          return this.poolsStore.myPoolsItems.filter(
            ({ asset1: { name: name1 }, asset2: { name: name2 } }) =>
              isSubstrString(`${name1}${name2}`, this.filterValue) || isSubstrString(`${name1}-${name2}`, this.filterValue)
          );
    },
    haveFilteredItems() {
      if (this.isAllTab) return this.filteredPoolsItems.length;

          return this.filteredMyPoolsItems.length;
    },
    showLoader() {
      if (this.activeTabName === 'all' && this.isLoading) return true;

          return this.activeTabName === '';
    },
    noPoolsItems() {
      return !this.showPoolsItems && !this.showMyPoolsItems;
    },
    showPoolsItems() {
      return this.poolsStore.poolsItems.length !== 0;
    },
    showMyPoolsItems() {
      return this.poolsStore.myPoolsItems.length !== 0;
    },
    contentFormHeight() {
      return CONTENT_FORM_HEIGHT;
    },
    isAllTab() {
      return this.activeTabName === 'all';
    },
  },
  watch: {
    "showPoolsItems": 'updateTab1',
    "showMyPoolsItems": 'updateTab2',
    "selectedWallet": 'updateTabPoolsParams',
  },
  created() {
    this.fetchPoolInfo();

        const callback = (accountLiquidity: AccountLiquidity[]) => {
          console.info('Client accountLiquidity:', accountLiquidity);

          this.fetchPoolInfo();
        };

        subscribeAccountLiquidity(callback);
  },
  methods: {
    updateTab1(newValue: boolean) {
      if (!newValue) this.updateActiveTabName('my');
    },
    updateTab2(newValue: boolean) {
      if (!newValue) this.updateActiveTabName('all');
    },
    async updateTabPoolsParams() {
      this.isLoading = true;

          await this.poolsStore.getPoolsParams({ delay: 5000 });

          this.isLoading = false;
    },
    async fetchPoolInfo() {
      const updateTab = () => this.updateActiveTabName(this.showMyPoolsItems ? 'my' : 'all');

          if (this.showMyPoolsItems && !this.showPoolsItems) updateTab();

          await this.poolsStore.getPoolsParams();

          if (this.activeTabName === '') updateTab();
    },
    updateFilterValue(value: string) {
      this.filterValue = value;
    },
    updateActiveTabName(name: PoolsTab) {
      this.activeTabName = name;
    },
    openPoolDetails(poolParams: PoolParams) {
      const asset1 = poolParams.asset1.name;
          const asset2 = poolParams.asset2.name;

          this.$router.push({
            name: Components.PoolDetails,
            params: {
              poolName: `${asset1}-${asset2}`,
            },
          });
    },
    closeForm() {
      unsubscribePools();

          this.$router.push({ name: Components.Wallet });
    },
    getKey(item: PoolParams) {
      return item.asset1.name + item.asset2.name;
    },
  },
});
</script>

<style lang="scss" scoped>
.pools {
  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;

    .no-pools {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
  }

  .nothing-found {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
