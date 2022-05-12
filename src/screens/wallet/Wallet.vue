<template>
  <div class="wallet">
    <div class="wallet-header">
      <TotalBalance :balance="totalBalance" :percent="totalPercent" />

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopupVisible"
      />
    </div>

    <PopupWithSelect
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      horizontalPlacement="right"
      verticalPlacement="center"
      :showIcon="true"
      :showSearch="true"
      :staticHeight="true"
      :options="filterOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter.bind(null, 'popupFilterValue')"
    />

    <div class="content">
      <ContentSettings
        :activeTabName="activeTabName"
        :showAssetsManagementForm="showAssetsManagementForm"
        :hideZeroBalance="hideZeroBalance"
        :handlerFilter="handlerFilter.bind(null, 'filterValue')"
        @update:activeTabName="updateActiveTabName"
        @update:showAssetsManagementForm="toggleAssetsManagementFormVisible"
        @update:hideZeroBalance="toggleHideZeroBalance"
      />

      <Scroll>
        <Currencies
          v-if="showCurrencies"
          :currencies="filterCurrencies"
          :showAssetsManagementForm="showAssetsManagementForm"
          :hideZeroBalance="hideZeroBalance"
          :toggleVisibleActivityForm="toggleVisibleActivityForm"
        />

        <NFTs v-else-if="showNfts" />
      </Scroll>
    </div>

    <SendForm
      v-if="showSendForm"
      :token="selectedCurrency.token"
      :selectedNetwork="selectedCurrency.mainNetwork"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="selectedCurrency.mainNetwork"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '@/store/api/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/api/types';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/stringHelper';
import { Currency } from '@/interfaces/currencies';
import type { TabWallet } from '@/interfaces/walletPage';
import Scroll from '@/components/Scroll.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';
import SelectNetworkButton from './SelectNetworkButton.vue';
import ReceiveForm from './ReceiveForm.vue';
import SendForm from './SendForm.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import TotalBalance from './TotalBalance.vue';
import NFTs from './NFTs.vue';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    PopupWithSelect,
    SelectNetworkButton,
    SendForm,
    ReceiveForm,
    ContentSettings,
    Currencies,
    NFTs,
    Scroll,
    TotalBalance,
  },
})
export default class extends Vue {
  showAssetsManagementForm = false;
  hideZeroBalance = false;
  selectNetworkButtonRef = 'selectNetworkButton';
  selectedCurrency!: Currency;
  activeTabName: TabWallet = 'Currencies';
  showSendForm = false;
  showReceiveForm = false;
  showSelectNetworkPopup = false;
  selectedNetwork = 'All networks';
  popupFilterValue = '';
  filterValue = '';

  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get currencies(): Currency[] {
    // TODO: fix as ''
    return currencyMock[this.selectedWallet.address as ''];
  }

  get totalBalance() {
    return this.currencies.reduce((sum, { price, availableInNetworks }) => {
      const sumToken = availableInNetworks.reduce((sumToken, { balance }) => sumToken + balance, 0);

      return price * sumToken + sum;
    }, 0);
  }

  get totalPercent() {
    return 5.3;
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showNfts() {
    return this.activeTabName === 'NFTs';
  }

  get filterCurrencies() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.currencies
      .filter(({ availableInNetworks }) => {
        if (this.selectedNetwork === 'All networks') return true;

        return availableInNetworks.map(({ network }) => network).includes(this.selectedNetwork);
      })
      .filter(({ mainNetwork }) => mainNetwork.includes(filter));
  }

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: getImgPathByNetworkName() },
      ...Object.keys(this.networksInfo).map((network) => {
        return { label: firstCharToUp(network), value: network, path: `networks/${getImgPathByNetworkName(network)}` };
      }),
    ];
  }

  get filterOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.includes(filter));
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleHideZeroBalance(value = true) {
    this.hideZeroBalance = value;
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true, currency: Currency) {
    this[field] = value;

    if (currency) this.selectedCurrency = currency;
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
  }

  handlerFilter(field: 'popupFilterValue' | 'filterValue', value: string) {
    this[field] = value;
  }

  updateActiveTabName(name: TabWallet) {
    this.activeTabName = name;
  }
}
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  .content {
    display: flex;
    flex-direction: column;
    padding: 16px 0 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: var(--default-clip-path-left-top);
    border-radius: 8px;
    height: 425px;
  }

  .wallet-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
}
</style>
