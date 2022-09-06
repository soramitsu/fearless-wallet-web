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
        v-for="({ meta: { name }, address }, index) in wallets"
        :key="name + index"
        :name="name"
        :isSelected="selectedWallet.address === address"
        :balance="getBalance(address)"
        :percent="getPercent()"
        class="total"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible(...arguments, address)"
        @updateSelectedWallet="updateSelectedWallet(address)"
      />

      <BorderButton text="Add wallet" iconName="plus-pink" @click="addWallet" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { SelectedWallet, SetSelectedWalletProps, Accounts } from '@/store/accounts/types';
import type { Currencies } from '@/interfaces/currencies';
import type { TMutation } from '@/interfaces/common';
import BaseApi from '@/util/BaseApi';
import Popup from '@/components/Popup.vue';
import WalletBalance from '@/screens/wallet/WalletBalance.vue';
import BorderButton from '@/components/BorderButton.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { addNumbers } from '@/util/numbers';

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
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get wallets() {
    return Object.keys(this.accounts)
      .map((address) => {
        const pair = BaseApi.getPair(address);

        return pair;
      })
      .filter(({ type, meta }) => type !== 'ethereum' && !meta.isReplacedAccount);
  }

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  getBalance(address: string) {
    const arr = this.currencies.map((currency) => currency.getTotalBalance({ address, ethereumAddress: address }));

    return addNumbers(arr);
  }

  walletPopupClick(event: Event) {
    const classList = (event.target as HTMLDivElement)?.classList;

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
  margin-bottom: 3px;
}

.total {
  margin-bottom: 12px;
}
</style>
