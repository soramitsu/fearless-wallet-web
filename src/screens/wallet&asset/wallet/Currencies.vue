<template>
  <Scroll>
    <Loader v-if="isEmptyBalances" class="asset-loader" />

    <div v-else-if="showAllAssetsHiddenText" class="info-text" data-testid="infoText">{{ $t(mainText()) }}</div>

    <Draggable v-else v-model="filteredBalances" handle=".handle" :key="accountsStore.selectedWallet.address">
      <CurrencyItem
        v-for="(asset, assetKey) in filteredBalances"
        :assetData="asset"
        :price="getAssetPrice(asset.priceId)"
        :priceChange="getPriceChange(asset.priceId)"
        :key="assetKey"
        :selectedNetwork="accountsStore.selectedNetwork"
        :showAssetsManagementForm="showAssetsManagementForm"
        :timeoutCallback="timeoutCallback"
        @toggleVisibleActivityForm="$emit('toggleVisibleActivityForm', ...arguments)"
        @toggleNetworkManagementVisible="$emit('toggleNetworkManagementVisible')"
      />
    </Draggable>
  </Scroll>
</template>

<script lang="ts">
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { TokenGroup } from '@extension-base/background/types/types';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type TimeoutSubscription = {
  subscription: NodeJS.Timeout;
  fn: () => void;
};

@Component({
  components: {
    Draggable,
    CurrencyItem,
  },
})
export default class Currencies extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  timeoutSubscriptions: TimeoutSubscription[] = [];

  @Prop(Array) balances!: TokenGroup[];
  @Prop(Boolean) isEmptyBalances!: boolean;
  @Prop(String) filterValue!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;

  get isOnline() {
    return navigator.onLine;
  }

  get showAllAssetsHiddenText() {
    if (!this.isOnline || !this.balances) return true;

    if (this.showAssetsManagementForm) return false;

    const allHidden = this.balances.every(({ groupId }) => this.accountsStore.hiddenAssets.includes(groupId));

    return this.balances.length === this.accountsStore.hiddenAssets.length || allHidden || !navigator.onLine;
  }

  get filteredBalances() {
    return this.balances;
  }

  set filteredBalances(balances) {
    this.accountsStore.setBalance({
      details: balances,
      reset: false,
      saveSequence: true,
    });
  }

  getAssetPrice(assetKey: string | undefined) {
    if (assetKey === undefined) return 0;

    if (Object.keys(this.networksStore.assetsPrice).length && this.networksStore.assetsPrice.tokenPriceMap[assetKey])
      return this.networksStore.assetsPrice.tokenPriceMap[assetKey];

    return 0;
  }

  getPriceChange(assetKey: string | undefined) {
    if (
      this.networksStore.assetsPrice === undefined ||
      this.networksStore.assetsPrice.tokenPriceChange === undefined ||
      assetKey === undefined
    )
      return 0;

    if (this.networksStore.assetsPrice.tokenPriceChange[assetKey])
      return this.networksStore.assetsPrice.tokenPriceChange[assetKey] / 100;

    return 0;
  }

  timeoutCallback(fn: () => void) {
    this.timeoutSubscriptions.forEach(({ subscription }) => clearTimeout(subscription));

    this.timeoutSubscriptions = [...this.timeoutSubscriptions, { fn }].map(({ fn }) => {
      const subscription = setTimeout(() => fn(), 0);

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
</style>
