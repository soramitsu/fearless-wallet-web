<template>
  <div class="staking">
    <header class="staking-header">
      <div class="balance-container">
        <div class="staking-balance">
          <span class="label"> {{ $t('staking.stakingBalance') }} </span>

          <WalletBalance class="balance" :balance="stakingBalance" />
        </div>

        <div class="balance-loading">
          <Loading v-if="showLoading" :width="28" />
        </div>
      </div>
    </header>

    <ContentForm :height="375">
      <div class="content">
        <Loader v-if="showLoader" />

        <template v-else>
          <StakingSettings
            :activeTabName="activeTabName"
            :filterValue="filterValue"
            :showStakingItems="showStakingItems"
            :showMyStakingItems="showMyStakingItems"
            @update:filterValue="updateFilterValue"
            @update:activeTabName="updateActiveTabName"
          />

          <Scroll>
            <template v-if="isAllTab">
              <StakingItem
                v-for="item in stakingItems"
                :key="item.network"
                :networkParams="item"
                @click="updateNetworkBond(item)"
              />
            </template>

            <template v-else>
              <MyStakingItem v-for="item in myStakingItems" :key="item.network" :networkParams="item" />
            </template>
          </Scroll>
        </template>
      </div>
    </ContentForm>

    <Bond v-if="showBond" :networkParams="networkParams" @closeBond="updateNetworkBond" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { AsyncFn, StakingTab } from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { NetworkParams } from '@/store';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { networksIsPending } from '@/helpers/shimmers';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import StakingSettings from '@/screens/staking/StakingSettings.vue';
import StakingItem from '@/screens/staking/StakingItem.vue';
import MyStakingItem from '@/screens/staking/MyStakingItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import Bond from '@/screens/staking/Bond.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';
import { GetAssetPrice } from '@/store';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { isSameString } from '@/helpers';
import { ActionTypes as StakingActionTypes } from '@/store/staking/actions';
import { getCostOfAssets } from '@/controllers/transferHelpers';

@Component({
  components: {
    Bond,
    StakingItem,
    MyStakingItem,
    WalletBalance,
    StakingSettings,
    SelectNetworkButton,
  },
})
export default class StakingPage extends Vue {
  showNetworkManagement = false;
  activeTabName: StakingTab | '' = '';
  filterValue = '';
  networkParams: Nullable<NetworkParams> = null;

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(StakingGettersTypes.stakingItems) stakingItems!: NetworkParams[];
  @Getter(StakingGettersTypes.myStakingItems) myStakingItems!: NetworkParams[];
  @Action(StakingActionTypes.GET_STAKING_PARAMS) getStakingParams!: AsyncFn;

  get showLoader() {
    return this.activeTabName === '';
  }

  get showStakingItems() {
    return this.stakingItems.length !== 0;
  }

  get showMyStakingItems() {
    return this.myStakingItems.length !== 0;
  }

  get showBond() {
    return this.networkParams !== null;
  }

  get showLoading() {
    const networks = this.networks.filter(({ name }) =>
      this.myStakingItems.some(({ network }) => isSameString(name, network))
    );

    return networksIsPending(networks);
  }

  get contentFormHeight() {
    return CONTENT_FORM_HEIGHT;
  }

  get stakingBalance() {
    return this.myStakingItems.reduce((sum, { bondAmount, assetId }) => {
      const { priceId } = this.balances.find(({ assetId: _assetId }) => _assetId === assetId)!;
      const assetPrice = this.getAssetPrice(priceId ?? '').price;
      const value = getCostOfAssets(bondAmount, assetPrice);

      return sum + value;
    }, 0);
  }

  get isAllTab() {
    return this.activeTabName === 'all';
  }

  created() {
    // Добавлено чтобы не было видно переключений с all tab на my tab при отсутствующих stakingItems
    setTimeout(() => this.updateActiveTabName(this.showStakingItems ? 'all' : 'my'), 500);

    this.getStakingParams();
  }

  @Watch('showStakingItems')
  updateTab1(newValue: boolean) {
    if (!newValue) this.updateActiveTabName('my');
  }

  @Watch('showMyStakingItems')
  updateTab2(newValue: boolean) {
    if (!newValue) this.updateActiveTabName('all');
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: StakingTab) {
    this.activeTabName = name;
  }

  updateNetworkBond(networkParams: Nullable<NetworkParams> = null) {
    this.networkParams = networkParams;
  }
}
</script>

<style lang="scss" scoped>
.staking {
  .staking-header {
    min-height: 46px;
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .balance-container {
    display: flex;
    flex-flow: row;
    gap: 5px;

    .balance {
      font-size: 22px;
      line-height: 28px;
      max-width: 245px;
    }

    .balance-loading {
      height: 46px;
    }

    .staking-balance {
      display: flex;
      flex-direction: column;
      text-transform: uppercase;

      .label {
        color: $gray-color;
        font-weight: 500;
        margin-bottom: 7px;
      }
    }
  }

  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
}
</style>
