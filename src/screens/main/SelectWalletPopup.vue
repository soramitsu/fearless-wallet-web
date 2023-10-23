<template>
  <Popup
    horizontalPlacement="left"
    verticalPlacement="top"
    sizeWidth="small"
    :showHeader="false"
    :showBorder="true"
    @handlerClose="close"
    :top="55"
    :maxHeight="391"
    @click.native="walletPopupClick"
  >
    <div class="wallet-content">
      <WalletInfo
        v-for="({ name, address, active, isMobile }, index) in wallets"
        :key="name + index"
        :name="name"
        :isSelected="active"
        :isMobile="isMobile"
        :address="address"
        class="wallet"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible(...arguments, address)"
        @setWallet="updateSelectedWallet(address)"
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
import type { Fn, CustomEvent } from '@/interfaces';
import type { AccountJson } from '@extension-base/background/types/types';
import type { CurrentAccountInfo } from '@/extension/background/extension-base/src/stores/CurrentAccountStore';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { Components } from '@/router/routes';
import { updateCurrentAccount } from '@/extension/messaging';

@Component({
  components: { WalletInfo },
})
export default class SelectWalletPopup extends Vue {
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: Fn<CurrentAccountInfo>;

  addWallet() {
    this.$router.push({ name: Components.Welcome });
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
    updateCurrentAccount(address);

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

.wallet {
  margin-bottom: 12px !important;
}
</style>
