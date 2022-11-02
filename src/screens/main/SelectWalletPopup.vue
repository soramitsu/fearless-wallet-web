<template>
  <Popup
    horizontalPlacement="left"
    verticalPlacement="top"
    sizeWidth="small"
    :showHeader="false"
    :showBorder="true"
    :handlerClose="close"
    :top="55"
    @click.native="walletPopupClick"
  >
    <div class="wallet-content">
      <WalletBalance
        v-for="({ meta: { name, ethereumAddress }, address }, index) in wallets"
        :key="name + index"
        :name="name"
        :isSelected="selectedWallet.address === address"
        :isMobile="isMobile(address)"
        :balance="getBalance(address, ethereumAddress)"
        :percent="getPercent()"
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
import WalletBalance from './WalletBalance.vue';
import type { SelectedWallet, SetSelectedWalletProps, Accounts } from '@/store/accounts/types';
import type { Currencies, TMutation } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import Popup from '@/components/Popup.vue';
import BorderButton from '@/components/BorderButton.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { addNumbers } from '@/helpers/numbers';

interface HTMLDivElementEvent extends Event {
  target: HTMLDivElement;
}

@Component({
  components: {
    Popup,
    BorderButton,
    WalletBalance,
  },
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

  walletPopupClick(event: HTMLDivElementEvent) {
    const classList = event.target?.classList;

    if (!(classList.contains('dots-container') || classList.contains('dots')))
      this.$emit('toggleWalletDetailsPopupVisible', false);
  }

  updateSelectedWallet(address: string) {
    this.setSelectedWallet({ selectedWalletAddress: address });

    this.close();
  }

  close() {
    this.$emit('close');
  }

  getPercent() {
    return 5.3;
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
  margin-bottom: 12px;
}
</style>
