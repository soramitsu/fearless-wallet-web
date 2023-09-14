<template>
  <Fragment>
    <ContentForm :height="341">
      <div class="networks">
        <div class="networks-settings">
          <TabButton
            v-for="{ label, tabName, tooltipText, target, classes } in tabsOptions"
            class="tab"
            :key="tabName"
            :tooltipText="tooltipText"
            :target="target"
            :class="classes"
            :label="label"
            :isActive="activeTabName === tabName"
            @click="openTab(tabName)"
          />

          <div class="filter__icon" @click="toggleSelectFilterPopupVisibility">
            <Icon icon="filter" className="filter" />
          </div>
        </div>

        <Scroll>
          <div class="networks networks-content">
            <AssetRow
              v-for="({ name, icon }, index) in sortedNetworks"
              :key="index"
              :text="name"
              :value="getBalanceInNetworkString(name)"
              :price="getFiatInNetworkString(name)"
              :icon="icon"
              :isIconPrepend="true"
              @selectHistory="selectNetworkHistory(name)"
            />
          </div>
        </Scroll>
      </div>
    </ContentForm>

    <SelectPopup
      v-if="showSelectFilterPopup"
      sizeWidth="medium"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      horizontalPlacement="center"
      :value="filterValue"
      :showBlur="true"
      :showBackground="true"
      :height="210"
      :top="285"
      :left="50"
      :showSearch="false"
      :showIcon="false"
      :options="filterDropdownOption"
      @toggleValue="filterValueUpdate"
      @handlerClose="toggleSelectFilterPopupVisibility"
    />
  </Fragment>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { TokenBalance } from '@extension-base/background/types/types';
import HistoryItem from './HistoryItem.vue';
import type { NetworkJson } from '@extension-base/types';
import type { GetHistory } from '@/interfaces';
import type { GetAssetPrice, GetNetwork, SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import AssetRow from '@/screens/wallet&asset/asset/AssetRow.vue';
import { Components } from '@/router/routes';
import { NetworksController } from '@/controllers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

interface TabsOptions {
  label: string;
  tabName: 'Assets' | 'MyAssets';
  tooltipText: string;
  classes: string;
  target: string;
}

@Component({
  components: { HistoryItem, AssetRow },
})
export default class AssetNetworks extends Vue {
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

  readonly filterDropdownOption = [
    { name: this.$t('assets.filters.fiat'), value: 'fiat' },
    { name: this.$t('assets.filters.popularity'), value: 'popularity' },
    { name: this.$t('assets.filters.name'), value: 'name' },
  ];

  filterValue = 'fiat';
  activeTabName = 'Assets';
  showSelectFilterPopup = false;

  @Prop(Object) currency!: TokenBalance;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(NetworksGettersTypes.allNetworks) allNetworks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get filteredNetworks() {
    const baseFilter = this.currency.balances?.filter(({ name }) => {
      const network = this.getNetwork(name);

      if (this.selectedNetwork === POPULAR_NETWORKS) return network.rank !== undefined;
      if (this.selectedNetwork === FAVORITE_NETWORKS)
        return network.favorite.some((address) => address === this.selectedWallet.address);

      return this.getNetwork(name).active;
    });

    if (this.activeTabName === 'MyAssets') {
      return baseFilter.filter(({ transferable }) => {
        if (transferable && +transferable > 0) return true;

        return false;
      });
    }

    return baseFilter;
  }

  get sortedNetworks() {
    return this.filteredNetworks?.sort((a, b) => {
      if (this.filterValue === 'fiat') {
        const value1 = +(a.transferable ?? 0);
        const value2 = +(b.transferable ?? 0);

        return value2 - value1;
      }

      if (this.filterValue === 'popularity') {
        const value1 = NetworksController.getNetwork(a.name).rank ?? Infinity;
        const value2 = NetworksController.getNetwork(a.name).rank ?? Infinity;

        return value1 - value2;
      }

      return a.name.localeCompare(b.name);
    });
  }

  get priceString() {
    return `${this.fiatSymbol} ${this.$n(this.price, 'price')}`;
  }

  get price() {
    const price = this.getTokenPrice(this.currency.priceId ?? '').price;

    return +(price ?? 0);
  }

  selectNetworkHistory(name: string) {
    this.$router.push({
      name: Components.AssetHistory,
      params: {
        selectedNetwork: name.toLowerCase(),
      },
    });
  }

  openTab(name: string) {
    this.activeTabName = name;
  }

  toggleSelectFilterPopupVisibility() {
    this.showSelectFilterPopup = !this.showSelectFilterPopup;
  }

  getBalanceInNetworkString(network: string) {
    return `${this.$n(this.getBalanceInNetwork(network), 'decimal')} ${this.currency.symbol.toUpperCase()}`;
  }

  getBalanceInNetwork(network: string) {
    const balance = this.currency.balances.find((el) => el.name === network)?.transferable;
    const prepBalance = balance ? Number(balance) : 0;

    return prepBalance;
  }

  getFiatBalanceInNetwork(network: string) {
    const balance = this.currency.balances.find((el) => el.name === network)?.transferable;
    const prepBalance = balance ? Number(balance) : 0;

    return prepBalance * +this.price ?? 0;
  }

  getFiatInNetworkString(network: string) {
    return `${this.fiatSymbol} ${this.$n(this.getFiatBalanceInNetwork(network), 'price')}`;
  }

  filterValueUpdate(name: string) {
    this.filterValue = name;

    this.toggleSelectFilterPopupVisibility();
  }
}
</script>

<style lang="scss" scoped>
.networks {
  height: 100%;
  display: flex;
  flex-direction: column;

  .networks-settings {
    display: flex;
    align-items: center;
    margin: 11px $default-padding 5px 18px;
    gap: 12px;

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
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .networks-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .networks {
    height: 200px;
  }
}
</style>
