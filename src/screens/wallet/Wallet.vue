<template>
  <div class="wallet">
    <div class="header">
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
      sizeWidth="big"
      :showIcon="true"
      :showSearch="true"
      :showBorder="true"
      :staticHeight="true"
      :options="filteredOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter.bind(null, 'popupFilterValue')"
    />

    <ContentForm :height="418">
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
            :currencies="filteredCurrencies"
            :selectedNetwork="selectedNetwork"
            :showAssetsManagementForm="showAssetsManagementForm"
            :hideZeroBalance="hideZeroBalance"
            :toggleVisibleActivityForm="toggleVisibleActivityForm"
          />

          <NFTs v-else-if="showNfts" />
        </Scroll>
      </div>
    </ContentForm>

    <SendForm
      v-if="showSendForm"
      :currencies="currenciesForSelectedWallet"
      :_selectedToken="selectedCurrency.token"
      :_selectedNetwork="selectedCurrency.mainNetwork"
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
import Scroll from '@/components/Scroll.vue';
import ContentForm from '@/components/ContentForm.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';
import SelectNetworkButton from './SelectNetworkButton.vue';
import ReceiveForm from './ReceiveForm.vue';
import SendForm from './SendForm.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import TotalBalance from './TotalBalance.vue';
import NFTs from './NFTs.vue';
import { accountController } from '@/controllers/accountController';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks, SetCurrenciesProps } from '@/store/networks/types';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { getCurrencies } from '@/util/currenciesHelper';
import { firstCharToUp } from '@/util/helpers';
import { addNumbers } from '@/util/numbers';
import type { Currencies as TCurrencies, Currency } from '@/interfaces/currencies';
import type { TMutation, TabWallet } from '@/interfaces/common';

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
    ContentForm,
  },
})
export default class Wallet extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  showAssetsManagementForm = false;
  hideZeroBalance = false;
  selectedCurrency!: {
    mainNetwork: string;
    token: string;
  };

  existSavedSequence = false;
  activeTabName: TabWallet = 'Currencies';
  showSendForm = false;
  showReceiveForm = false;
  showSelectNetworkPopup = false;
  selectedNetwork = 'All networks';
  popupFilterValue = '';
  filterValue = '';

  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: TCurrencies;
  @Getter(NetworksGettersTypes.getAllNetworksIsLoaded) allNetworksIsLoaded!: boolean;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get currenciesForSelectedWallet() {
    const subsequenceTokens = accountController.getSubsequenceTokens();
    const currencies = [
      ...(this.currencies[this.selectedWallet.address] ?? []),
      ...(this.currencies[this.selectedWallet.ethereumAddress] ?? []),
    ];

    // at the first launch of the extension sort by fiat balance
    if (!this.existSavedSequence) {
      const relayChains = [];
      const currenciesWithTokens = currencies.filter((currency) => currency.getTotalCountTokens() !== '0');
      const currenciesWithoutTokens = currencies.filter((currency) => currency.getTotalCountTokens() === '0');
      const dotIndex = currenciesWithoutTokens.findIndex(({ token }) => token === 'dot');

      if (dotIndex !== -1) {
        const dot = currenciesWithoutTokens.splice(dotIndex, 1)[0];

        relayChains.push(dot);
      }

      const ksmIndex = currenciesWithoutTokens.findIndex(({ token }) => token === 'ksm');

      if (ksmIndex !== -1) {
        const ksm = currenciesWithoutTokens.splice(ksmIndex, 1)[0];

        relayChains.push(ksm);
      }

      currenciesWithTokens.sort((currency1, currency2) => {
        const totalBalanceOne = +currency1.getTotalBalance();
        const totalBalanceTwo = +currency2.getTotalBalance();

        return totalBalanceTwo - totalBalanceOne;
      });

      currenciesWithoutTokens.sort(({ token: token1 }, { token: token2 }) => token1.localeCompare(token2));

      return [...currenciesWithTokens, ...relayChains, ...currenciesWithoutTokens];
    } else {
      currencies.sort(({ mainNetwork: mainNetwork1 }, { mainNetwork: mainNetwork2 }) => {
        const index1 = subsequenceTokens.indexOf(mainNetwork1);
        const index2 = subsequenceTokens.indexOf(mainNetwork2);

        return index1 - index2;
      });
    }

    return currencies;
  }

  get filteredCurrencies() {
    if (this.showAssetsManagementForm) return this.currenciesForSelectedWallet;

    const filter = this.filterValue.trim().toLowerCase();

    return this.currenciesForSelectedWallet.filter((currency) => {
      const isAllNetworks = this.selectedNetwork === 'All networks';
      const availableInSelectedNetwork = isAllNetworks
        ? false
        : currency
            .getAvailableInNetworks()
            .map(({ network }) => network)
            .includes(this.selectedNetwork);

      // if a network is selected and there is no currency in this network
      if (!isAllNetworks && !availableInSelectedNetwork) return false;

      const { mainNetwork, token } = currency;

      return mainNetwork.includes(filter) || token.includes(filter);
    });
  }

  get totalBalance() {
    return addNumbers(this.currenciesForSelectedWallet.map((currency) => currency.getTotalBalance()));
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
      { label: 'All networks', value: 'All networks', path: 'globus.svg' },
      ...this.networks.map(({ name }) => {
        return { label: firstCharToUp(name), value: name, path: `networks/${getImgPathByNetworkName(name)}` };
      }),
    ];
  }

  get filteredOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
  }

  @Watch('allNetworksIsLoaded')
  setSubsequenceTokens() {
    if (this.existSavedSequence) return;

    const subsequence = this.currenciesForSelectedWallet.map(({ mainNetwork }) => mainNetwork);
    const currencies = getCurrencies(this.currenciesForSelectedWallet, this.selectedWallet);

    accountController.setSubsequenceTokens(subsequence);
    this.setCurrencies({ currencies });
    this.existSavedSequence = true;
  }

  mounted() {
    this.hideZeroBalance = accountController.getHideZeroBalanceValue();
    this.existSavedSequence = accountController.getSubsequenceTokens().length > 0;
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleHideZeroBalance(value: boolean) {
    this.hideZeroBalance = value;
    accountController.setHideZeroBalanceValue(value);
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true, currency: Currency) {
    this[field] = value;

    if (currency)
      this.selectedCurrency = {
        mainNetwork: currency.mainNetwork,
        token: currency.token,
      };
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;
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

  .content-form-height {
    height: 418px;
  }

  .content {
    padding: 16px 0 0 16px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }
}
</style>
