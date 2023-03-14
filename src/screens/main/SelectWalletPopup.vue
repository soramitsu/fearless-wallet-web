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
        v-for="({ name, address, active }, index) in wallets"
        :key="name + index"
        :name="name"
        :isSelected="active"
        :isMobile="isMobile(address)"
        :balance="0"
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
import type { SelectedWallet } from '@/store';
import type { Currencies, TMutation, CustomEvent } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { Components } from '@/router/routes';
import { addNumbers, getChangeWalletBalance } from '@/helpers/numbers';
import { AccountJson } from '@/extension/background/extension-base/src/background/types';
import { saveCurrentAccountAddress, updateCurrentAccountAddress } from '@/extension/messaging';
import { CurrentAccountInfo } from '@/extension/background/extension-base/src/stores/CurrentAccountStore';

@Component({
  components: { WalletInfo },
})
export default class SelectWalletPopup extends Vue {
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  // @Getter(AccountsGettersTypes.getAddresses) addresses!: Accounts;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  @Mutation(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<CurrentAccountInfo>;

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  isMobile(address: string) {
    return this.selectedWallet.isMobile ?? false;
  }

  // getBalance(address: string, ethereumAddress: string) {
  //   // const arr = this.currencies.map((currency) => currency.getTotalBalance({ address, ethereumAddress }));

  //   return 0;
  // }

  // getChangeWalletBalance(address: string, ethereumAddress: string) {
  //   return getChangeWalletBalance(this.currencies);
  // }

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
    updateCurrentAccountAddress(address);

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
