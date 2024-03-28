<template>
  <div class="pools">
    <ContentForm :height="382">
      <div class="content">
        <Loader v-if="showLoader" />

        <div v-else-if="noPoolsItems" class="no-pools">{{ $t('pools.noPools') }}</div>

        <template v-else>
          <PoolsSettings
            :activeTabName="activeTabName"
            :filterValue="filterValue"
            :showPoolsItems="showPoolsItems"
            :showMyPoolsItems="showMyPoolsItems"
            @update:filterValue="updateFilterValue"
            @update:activeTabName="updateActiveTabName"
          />

          <Scroll>
            <template v-if="haveFilteredItems">
              <template v-if="isAllTab">
                <PoolsItem
                  v-for="item in filteredPoolsItems"
                  :key="item.network"
                  :networkParams="item"
                  @click="updateNetworkPool(item)"
                />
              </template>

              <template v-else>
                <MyPoolsItem v-for="item in filteredMyPoolsItems" :key="item.network" :networkParams="item" />
              </template>
            </template>

            <div v-else class="nothing-found">{{ $t('common.nothingFound') }}</div>
          </Scroll>
        </template>
      </div>
    </ContentForm>

    <AddLiquidity v-if="showLiquidity" :networkParams="networkParams" @closeLiquidity="updateNetworkPool" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import type { AsyncFn, PoolsTab } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkParams, SelectedWallet, GetAssetPrice, GetPoolsParamsProps } from '@/store';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import PoolsSettings from '@/screens/pools/PoolsSettings.vue';
import PoolsItem from '@/screens/pools/PoolsItem.vue';
import MyPoolsItem from '@/screens/pools/MyPoolsItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import AddLiquidity from '@/screens/pools/AddLiquidity.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as PoolsGettersTypes } from '@/store/pools/getters';
import { isSubstrString } from '@/helpers';
import { ActionTypes as PoolsActionTypes } from '@/store/pools/actions';

@Component({
  components: {
    PoolsItem,
    MyPoolsItem,
    AddLiquidity,
    PoolsSettings,
  },
})
export default class PoolsPage extends Vue {
  activeTabName: PoolsTab | '' = '';
  filterValue = '';
  isLoading = false;
  networkParams: Nullable<NetworkParams> = null;

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(PoolsGettersTypes.poolsItems) poolsItems!: NetworkParams[];
  @Getter(PoolsGettersTypes.myPoolsItems) myPoolsItems!: NetworkParams[];
  @Action(PoolsActionTypes.GET_POOLS_PARAMS) getPoolsParams!: AsyncFn<GetPoolsParamsProps>;

  get filteredPoolsItems() {
    if (this.filterValue === '') return this.poolsItems;

    return this.poolsItems.filter(({ network }) => isSubstrString(network, this.filterValue));
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

  get showLiquidity() {
    return this.networkParams !== null;
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

  updateNetworkPool(networkParams: Nullable<NetworkParams> = null) {
    this.networkParams = networkParams;
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
