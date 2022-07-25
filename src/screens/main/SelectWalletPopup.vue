<template>
  <Popup
    class="select-wallet-popup"
    horizontalPlacement="left"
    verticalPlacement="top"
    :showHeader="false"
    :handlerClose="close"
    :top="49"
    :left="42"
  >
    <div class="wallet-content">
      <TotalBalance
        v-for="({ meta: { name }, address }, index) in wallets"
        :key="name + index"
        :name="name"
        :showIcon="selectedWallet.address === address"
        :balance="getBalance(address)"
        :percent="getPercent(address)"
        class="total"
        @click="updateSelectedWallet(address)"
      />

      <div class="add-wallet" @click="addWallet">
        <s-icon name="basic-plus-24" class="icon" />

        Add wallet
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import Popup from '@/components/Popup.vue';
import TotalBalance from '@/screens/wallet/TotalBalance.vue';
import keyring from '@polkadot/ui-keyring';
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { addNumbers } from '@/util/numbers';
import type { SelectedWallet, SetSelectedWalletProps } from '@/store/accounts/types';
import type { Currencies } from '@/interfaces/currencies';
import type { TMutation } from '@/interfaces/common';

@Component({
  components: {
    Popup,
    TotalBalance,
  },
})
export default class SelectWalletPopup extends Vue {
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get wallets() {
    const accounts = keyring.getAccounts();

    return accounts
      .map(({ address }) => {
        const pair = keyring.getPair(address);

        return pair;
      })
      .filter(({ type, meta }) => type !== 'ethereum' && !meta.isReplacementAccount);
  }

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  getBalance(address: string) {
    const currencies = this.currencies[address];

    return addNumbers(currencies.map((currency) => currency.getTotalBalance()));
  }

  getPercent(address: string) {
    return 5.3;
  }

  updateSelectedWallet(address: string) {
    this.setSelectedWallet({ selectedWalletAddress: address });

    this.close();
  }

  close() {
    this.$emit('close');
  }
}
</script>

<style lang="scss" scoped>
.select-wallet-popup {
  .wallet-content {
    padding: 0 16px;
  }

  .total {
    margin-bottom: 12px;
  }

  .add-wallet {
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    line-height: 18px;
    color: #888888;
    margin-top: 21px;
    opacity: 0.9;

    &:hover {
      cursor: pointer;
      opacity: 1;
    }

    .s-icon-basic-plus-24 {
      color: rgba(255, 255, 255, 0.5);
      margin-right: 15px;
    }
  }
}
</style>
