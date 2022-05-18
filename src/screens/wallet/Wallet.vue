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

    <Corners size="big" :bottomRightCorner="false">
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
            :selectedNetwork="selectedNetwork"
            :showAssetsManagementForm="showAssetsManagementForm"
            :hideZeroBalance="hideZeroBalance"
            :toggleVisibleActivityForm="toggleVisibleActivityForm"
          />

          <NFTs v-else-if="showNfts" />
        </Scroll>
      </div>
    </Corners>

    <SendForm
      v-if="showSendForm"
      :currencies="filterCurrencies"
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
import { GettersTypes as ApisGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/stringHelper';
import { Currency, Currencies as TCurrencies } from '@/interfaces/currencies';
import type { TabWallet } from '@/interfaces/walletPage';
import Scroll from '@/components/Scroll.vue';
import Corners from '@/components/Corners.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';
import SelectNetworkButton from './SelectNetworkButton.vue';
import ReceiveForm from './ReceiveForm.vue';
import SendForm from './SendForm.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import TotalBalance from './TotalBalance.vue';
import NFTs from './NFTs.vue';
import CurrencyController from '@/controllers/currencyController';

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
    Corners,
  },
})
export default class Wallet extends Vue {
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

  get currencies(): TCurrencies {
    return this.networksInfo
      .map(({ balances, assets, name }) => {
        const walletAddress = this.selectedWallet.address;
        const balance = balances.find(({ address }) => address === walletAddress)?.balance;
        const total = +(balance?.total ?? 0);
        const token = assets[0]?.assetId;

        return {
          walletAddress,
          token,
          mainNetwork: name,
          price: 5,
          grown: 1,
          grownPercent: 5,
          availableInNetworks: [
            {
              network: name,
              balance: total,
            },
          ],
        };
      })
      .sort(({ availableInNetworks: availableInNetworks1 }, { availableInNetworks: availableInNetworks2 }) => {
        const indexBalanceOne = availableInNetworks1.findIndex(({ balance }) => balance !== 0);
        const indexBalanceTwo = availableInNetworks2.findIndex(({ balance }) => balance !== 0);

        return indexBalanceTwo - indexBalanceOne;
      });
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

  get totalBalance() {
    return this.currencies.reduce((sum, currency) => {
      const currencyController = new CurrencyController(currency);
      const { totalBalance } = currencyController.getCurrencyInfo();

      return sum + totalBalance;
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

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: getImgPathByNetworkName() },
      ...this.networksInfo.map(({ name }) => {
        return { label: firstCharToUp(name), value: name, path: `networks/${getImgPathByNetworkName(name)}` };
      }),
    ];
  }

  get filterOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
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
    clip-path: var(--big-clip-path-left-top);
    border-radius: 8px;
    height: 418px;
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
