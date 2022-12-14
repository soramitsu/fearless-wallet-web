<template>
  <Popup
    horizontalPlacement="left"
    verticalPlacement="top"
    sizeWidth="small"
    :showHeader="false"
    :showBorder="true"
    :handlerClose="close"
    :top="55"
    :maxHeight="391"
    @click.native="walletPopupClick"
  >
    <div class="wallet-content">
      <WalletInfo
        v-for="({ meta: { name, ethereumAddress }, address }, index) in wallets"
        :key="name + index"
        :name="name"
        :isSelected="selectedWallet.address === address"
        :isMobile="isMobile(address)"
        :balance="getBalance(address, ethereumAddress)"
        :changeWalletBalance="getChangeWalletBalance(address, ethereumAddress)"
        class="total"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible(...arguments, address)"
        @updateSelectedWallet="updateSelectedWallet(address)"
      />

      <BorderButton text="wallet.addWallet" iconName="plus-pink" @click="addWallet" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import WalletInfo from './WalletInfo.vue';
import type { SelectedWallet, SetSelectedWalletProps, Accounts } from '@/store';
import type { Currencies, TMutation, CustomEvent } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { addNumbers, getChangeWalletBalance } from '@/helpers/numbers';

@Component({
  components: { WalletInfo },
})
export default class SelectWalletPopup extends Vue {
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;
  @Getter(AccountsGettersTypes.getAddresses) addresses!: Accounts;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get wallets() {
    const accounts = Object.keys(this.accounts)
      .map((address) => BaseApi.getPair(address))
      .filter(({ type, meta }) => type !== 'ethereum' && !meta.isReplacedAccount);

    const addresses = Object.keys(this.addresses).map((address) => BaseApi.getAddress(address));

    return [...addresses, ...accounts];
  }

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  isMobile(address: string) {
    return BaseApi.getWalletType(address) === 'mobile';
  }

  getBalance(address: string, ethereumAddress: string) {
    const arr = this.currencies.map((currency) => currency.getTotalBalance({ address, ethereumAddress }));

    return addNumbers(arr);
  }

  getChangeWalletBalance(address: string, ethereumAddress: string) {
    return getChangeWalletBalance(this.currencies, address, ethereumAddress);
  }

  walletPopupClick({ target: { classList } }: CustomEvent) {
    if (
      !(
        classList.contains('dots-container') ||
        classList.contains('dots') ||
        classList.contains('dots-horizontal') ||
        classList.contains('icon__inner')
      )
    )
      this.$emit('toggleWalletDetailsPopupVisible', false);
  }

  updateSelectedWallet(address: string) {
    this.setSelectedWallet({ selectedWalletAddress: address });

    this.close();
  }

  close() {
    this.$emit('close');
  }

  toggleWalletDetailsPopupVisible(buttonTop: number, address: string) {
    this.$emit('toggleWalletDetailsPopupVisible', undefined, buttonTop, address);
  }
}
</script>

<style lang="scss" scoped>
.wallet-content {
  padding: 0 $default-padding;
  height: 100%;
}

.total {
  margin-bottom: 12px !important;
}
</style>
