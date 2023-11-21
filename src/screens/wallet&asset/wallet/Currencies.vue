<template>
  <Fragment>
    <Loader v-if="isEmptyBalances" class="asset-loader" />

    <div v-else-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText()) }}</div>

    <VirtualDragList
      v-else
      :dataSource="filteredBalances"
      dataKey="assetId"
      handle=".handle"
      :size="80"
      class="scroll"
      style="height: calc(100%-170px)"
      :keeps="30"
      :keepOffset="true"
      itemClass="virtual-item"
      @drop="onDrop"
    >
      <template v-slot:item="{ record: asset, index }">
        <CurrencyItem
          :assetData="asset"
          :price="getAssetPrice(asset.priceId)"
          :priceChange="getPriceChange(asset.priceId)"
          :key="index"
          :selectedNetwork="selectedNetwork"
          :showAssetsManagementForm="showAssetsManagementForm"
          :timeoutCallback="timeoutCallback"
          @toggleVisibleActivityForm="$emit('toggleVisibleActivityForm', ...arguments)"
          @toggleNetworkManagementVisible="$emit('toggleNetworkManagementVisible')"
        />
      </template>
    </VirtualDragList>
  </Fragment>
</template>

<script lang="ts">
import VirtualDragList from 'vue-virtual-draglist';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { type TokenBalance, type BalanceJson } from '@extension-base/background/types/types';
import type { SelectedWallet } from '@/store';
import type { AsyncFn, AssetsPrice } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
type TimeoutSubscription = {
  subscription: NodeJS.Timeout;
  fn: () => void;
};

@Component({
  components: {
    VirtualDragList,
    CurrencyItem,
  },
})
export default class Currencies extends Vue {
  timeoutSubscriptions: TimeoutSubscription[] = [];

  @Prop(Array) balances!: TokenBalance[];
  @Prop(Boolean) isEmptyBalances!: boolean;
  @Prop(String) selectedNetwork!: string;
  @Prop(String) filterValue!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Getter(NetworksGettersTypes.prices) prices!: AssetsPrice;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;

  get isOnline() {
    return navigator.onLine;
  }

  get showAllAssetsHiddenText() {
    if (!this.isOnline) return true;

    if (this.showAssetsManagementForm) return false;

    const allHidden = this.balances.every(({ assetId }) => this.hiddenAssets.includes(assetId));

    return this.balances.length === this.hiddenAssets.length || allHidden || !navigator.onLine;
  }

  get filteredBalances() {
    return this.balances;
  }

  set filteredBalances(balances) {
    this.setBalance({
      details: balances,
      reset: false,
      saveSequence: true,
    });
  }
  onDrop(props: any) {
    this.setBalance({
      details: props.list,
      reset: false,
      saveSequence: true,
    });
  }
  getAssetPrice(assetKey: string | undefined) {
    if (assetKey === undefined) return 0;

    if (Object.keys(this.prices).length && this.prices.tokenPriceMap[assetKey])
      return this.prices.tokenPriceMap[assetKey];

    return 0;
  }

  getPriceChange(assetKey: string | undefined) {
    if (this.prices === undefined || this.prices.tokenPriceChange === undefined || assetKey === undefined) return 0;

    if (this.prices.tokenPriceChange[assetKey]) return this.prices.tokenPriceChange[assetKey] / 100;

    return 0;
  }

  timeoutCallback(fn: () => void) {
    this.timeoutSubscriptions.forEach(({ subscription }) => clearTimeout(subscription));

    this.timeoutSubscriptions = [...this.timeoutSubscriptions, { fn }].map(({ fn }) => {
      const subscription = setTimeout(() => fn(), 300);

      return { subscription, fn };
    });
  }

  mainText() {
    if (!navigator.onLine) return 'common.offlineStatus';

    return this.filterValue !== '' ? 'common.nothingFound' : 'wallet.allAssetsHidden';
  }
}
</script>

<style lang="scss" scoped>
.info-text {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: -16px;
}

.asset-loader {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.scroll {
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.25);
    border-radius: $default-border-radius;

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }
}
.virtual-item:last-child > .currency-item {
  border-bottom: none;
}
</style>
