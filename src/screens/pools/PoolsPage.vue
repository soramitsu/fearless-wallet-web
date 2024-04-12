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
                    :key="item.network"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>

                <template v-else>
                  <PoolItem
                    v-for="item in filteredMyPoolsItems"
                    :key="item.network"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>
              </template>

              <div v-else class="nothing-found">{{ $t('common.nothingFound') }}</div>
            </Scroll>
          </template>
        </div>
      </ContentForm>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { AsyncFn, PoolsTab } from '@/interfaces';
import type { SelectedWallet, GetPoolsParamsProps, PoolParams } from '@/store';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import PoolsSettings from '@/screens/pools/PoolsSettings.vue';
import PoolItem from '@/screens/pools/PoolItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as PoolsGettersTypes } from '@/store/pools/getters';
import { isSubstrString } from '@/helpers';
import { ActionTypes as PoolsActionTypes } from '@/store/pools/actions';
import { Components } from '@/router/routes';

@Component({
  components: {
    PoolItem,
    PoolsSettings,
  },
})
export default class PoolsPage extends Vue {
  activeTabName: PoolsTab | '' = '';
  filterValue = '';
  isLoading = false;
  poolParams: Nullable<PoolParams> = null;

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(PoolsGettersTypes.poolsItems) poolsItems!: PoolParams[];
  @Getter(PoolsGettersTypes.myPoolsItems) myPoolsItems!: PoolParams[];
  @Action(PoolsActionTypes.GET_POOLS_PARAMS) getPoolsParams!: AsyncFn<GetPoolsParamsProps>;

  get filteredPoolsItems() {
    if (this.filterValue === '') return this.poolsItems;

    return this.poolsItems.filter(({ asset1: { name: name1 }, asset2: { name: name2 } }) =>
      isSubstrString(`${name1}${name2}`, this.filterValue)
    );
  }

  get filteredMyPoolsItems() {
    if (this.filterValue === '') return this.myPoolsItems;

    return this.myPoolsItems.filter(({ network }) => isSubstrString(network, this.filterValue));
  }

  get haveFilteredItems() {
    if (this.isAllTab) return this.filteredPoolsItems.length;

    return this.filteredMyPoolsItems.length;
  }

  get showLoader() {
    if (this.activeTabName === 'all' && this.isLoading) return true;

    return this.activeTabName === '';
  }

  get noPoolsItems() {
    return !this.showPoolsItems && !this.showMyPoolsItems;
  }

  get showPoolsItems() {
    return this.poolsItems.length !== 0;
  }

  get showMyPoolsItems() {
    return this.myPoolsItems.length !== 0;
  }

  get contentFormHeight() {
    return CONTENT_FORM_HEIGHT;
  }

  get isAllTab() {
    return this.activeTabName === 'all';
  }

  async created() {
    const updateTab = () => this.updateActiveTabName(this.showPoolsItems ? 'all' : 'my');

    if (this.showMyPoolsItems && !this.showPoolsItems) updateTab();

    await this.getPoolsParams();

    if (this.activeTabName === '') updateTab();
  }

  @Watch('showPoolsItems')
  updateTab1(newValue: boolean) {
    if (!newValue) this.updateActiveTabName('my');
  }

  @Watch('showMyPoolsItems')
  updateTab2(newValue: boolean) {
    if (!newValue) this.updateActiveTabName('all');
  }

  @Watch('selectedWallet')
  async updateTabPoolsParams() {
    this.isLoading = true;

    await this.getPoolsParams({ delay: 5000 });

    this.isLoading = false;
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: PoolsTab) {
    this.activeTabName = name;
  }

  openPoolDetails(poolParams: PoolParams) {
    const asset1 = poolParams.asset1.name;
    const asset2 = poolParams.asset2.name;

    this.$router.push({
      name: Components.PoolDetails,
      params: {
        poolName: `${asset1}-${asset2}`,
      },
    });
  }

  closeForm() {
    this.$router.push({ name: Components.Wallet });
  }
}
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
