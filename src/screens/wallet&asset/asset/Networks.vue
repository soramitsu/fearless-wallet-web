<template>
  <Fragment>
    <!-- IMPORTANT: if <Menu /> showed use 306 -->
    <ContentForm :height="295">
      <div class="history">
        <div class="history-settings">
          <TabButton
            v-for="{ label, tabName, tooltipText, target, classes } in tabsOptions"
            class="tab"
            :key="tabName"
            :tooltipText="tooltipText"
            :target="target"
            :class="classes"
            :text="label"
            :isActive="activeTabName === tabName"
            @click="openTab(tabName)"
          />
          <Icon icon="filter" className="filter" />
        </div>

        <Scroll>
          <div :class="historyContainerClasses">
            <Loader v-if="showLoader" />

            <template v-else-if="!isEmptyHistory">
              <AssetRow
                v-for="({ name, icon }, index) in getNetworkByAsset"
                :key="index"
                :text="name"
                :value="getBalanceInNetwork(name)"
                :price="price"
                :icon="icon"
                :isIconPrepend="true"
              />
            </template>

            <div v-else>{{ $t('assets.noHistory') }}</div>
          </div>
        </Scroll>
      </div>
    </ContentForm>
    <AssetTip />
  </Fragment>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { TokenBalance } from '@extension-base/background/types/types';
import { NetworkJson } from '@extension-base/types';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, GetHistory } from '@/interfaces';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import AssetRow from '@/screens/wallet&asset/asset/AssetRow.vue';
import AssetTip from '@/screens/wallet&asset/asset/AssetTip.vue';
interface TabsOptions {
  label: string;
  tabName: 'Assets' | 'Networks';
  tooltipText: string;
  classes: string;
  target: string;
}

@Component({
  components: { HistoryItem, AssetRow, AssetTip },
})
export default class Networks extends Vue {
  readonly tabsOptions: TabsOptions[] = [
    {
      label: 'assets.networkAssets',
      tabName: 'Assets',
      tooltipText: 'assets.networkAssets',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
    {
      label: 'assets.myNetworks',
      tabName: 'Networks',
      tooltipText: 'assets.myNetworks',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
  ];

  readonly historyDropdownOption = [
    { label: 'assets.all', value: 'all' },
    { label: 'assets.transfer', value: 'transfer' },
    { label: 'assets.reward', value: 'reward' },
    { label: 'assets.extrinsic', value: 'extrinsic' },
  ];

  filterHistoryValue: FilterHistory = 'all';
  showLoader = false;
  activeTabName = 'Networks';
  @Prop(Object) currency!: TokenBalance;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) allNetworks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get getNetworkByAsset() {
    return this.allNetworks.filter((network) => network.assets.some(({ id }) => id === this.currency.assetId))!;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get historyContainerClasses() {
    return [
      'history-content',
      {
        'empty-history': this.isEmptyHistory,
      },
    ];
  }

  get isMainNetwork() {
    return !!this.currency.balances?.find(
      ({ name, isUtility, isNative }) =>
        name.toLowerCase() === this.selectedNetwork?.toLowerCase() && (isUtility || isNative)
    );
  }

  get isEmptyHistory() {
    return false;
  }

  openTab(name: string) {
    this.activeTabName = name;
  }

  getBalanceInNetwork(network: string) {
    const balance = this.currency.balances.find((el) => el.name === network)?.transferable;
    const prepBalance = balance ? Number(balance) : 0;

    return `${this.$n(prepBalance, 'decimal')} ${this.currency.symbol.toUpperCase()}`;
  }

  filterHistoryValueUpdate(name: FilterHistory) {
    this.filterHistoryValue = name;
  }

  get price() {
    const price = this.getTokenPrice(this.currency.priceId ?? '').price;
    const prepPrice = price ? +price : 0;

    return `${this.fiatSymbol} ${this.$n(prepPrice, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  display: flex;
  flex-direction: column;

  .history-settings {
    display: flex;
    align-items: center;
    margin: 11px $default-padding 5px 18px;
    gap: 12px;
    .history-label {
      font-weight: 600;
    }
    .filter {
      width: 24px;
      height: 24px;
      color: $grayish-white;
      margin-left: auto;
      margin-right: 0;
    }
  }

  .history-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .empty-history {
    align-items: center;
    justify-content: center;
    margin-top: -26px;
  }
}
</style>
