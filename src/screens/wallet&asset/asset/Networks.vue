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

          <div class="filter__icon" @click="toggleSelectFilter">
            <Icon icon="filter" className="filter" />
          </div>

          <SelectPopup
            v-if="showSelectNetworkPopup"
            sizeWidth="medium"
            placeholder="common.searchNetwork"
            verticalPlacement="top"
            horizontalPlacement="center"
            :value="filterHistoryValue"
            :showBlur="true"
            :showBackground="true"
            :height="210"
            :top="55"
            :left="50"
            :showSearch="false"
            :showIcon="false"
            :options="historyDropdownOption"
            :toggleValue="filterValueUpdate"
            :handlerClose="toggleSelectFilter"
          />
        </div>

        <Scroll>
          <div class="networks" :class="historyContainerClasses">
            <AssetRow
              v-for="({ name, icon }, index) in filteredNetworks"
              :key="index"
              :text="name"
              :value="getBalanceInNetwork(name)"
              :price="price"
              :icon="icon"
              :isIconPrepend="true"
            />
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
import type { GetHistory } from '@/interfaces';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import AssetRow from '@/screens/wallet&asset/asset/AssetRow.vue';
import AssetTip from '@/screens/wallet&asset/asset/AssetTip.vue';
interface TabsOptions {
  label: string;
  tabName: 'Assets' | 'MyAssets';
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
      tabName: 'MyAssets',
      tooltipText: 'assets.myNetworks',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
  ];

  readonly historyDropdownOption = [
    { name: this.$t('assets.filters.fiat'), value: 'fiat' },
    { name: this.$t('assets.filters.popularity'), value: 'popularity' },
    { name: this.$t('assets.filters.name'), value: 'name' },
  ];
  filterHistoryValue = 'fiat';
  activeTabName = 'Assets';
  showSelectNetworkPopup = false;
  @Prop(Object) currency!: TokenBalance;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) allNetworks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get filteredNetworks() {
    if (this.activeTabName === 'MyAssets') {
      return this.currency.balances.filter(({ transferable }) => {
        if (transferable && +transferable > 0) return true;

        return false;
      });
    }

    return this.currency.balances;
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

  get price() {
    const price = this.getTokenPrice(this.currency.priceId ?? '').price;
    const prepPrice = price ? +price : 0;

    return `${this.fiatSymbol} ${this.$n(prepPrice, 'price')}`;
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

  toggleSelectFilter() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  getBalanceInNetwork(network: string) {
    const balance = this.currency.balances.find((el) => el.name === network)?.transferable;
    const prepBalance = balance ? Number(balance) : 0;

    return `${this.$n(prepBalance, 'decimal')} ${this.currency.symbol.toUpperCase()}`;
  }

  filterValueUpdate(name: string) {
    this.filterHistoryValue = name;
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
    .filter__icon {
      margin-right: 0;
      margin-left: auto;

      .filter {
        width: 24px;
        height: 24px;
        color: $grayish-white;
        margin-left: auto;
        margin-right: 0;
      }
    }
  }
  .asset-row {
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .history-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .networks {
    height: 250px;
  }
}
</style>
