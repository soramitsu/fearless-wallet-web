<template>
  <div class="select-wallet-popup">
    <Popup :showHeader="false" horizontalPlacement="left" verticalPlacement="top" :top="49" :left="42">
      <div class="wallet-content">
        <TotalBalance
          v-for="({ meta: { name }, address, type }, index) in wallets"
          :key="name + index"
          :name="getName(name, type)"
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
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { SelectedWallet } from '@/store/accounts/types';
import { Components } from '@/router/routes';
import Popup from '@/components/Popup.vue';
import TotalBalance from '@/screens/wallet/TotalBalance.vue';
import keyring from '@polkadot/ui-keyring';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    Popup,
    TotalBalance,
  },
})
export default class extends Vue {
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: (props: Record<string, string>) => void;

  get wallets() {
    const accounts = keyring.getAccounts();

    return accounts.map(({ address }) => {
      const pair = keyring.getPair(address);

      return pair;
    });
  }

  get currencies() {
    return currencyMock;
  }

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  getName(name: string, type: string) {
    return type === 'ethereum' ? `${name} (ethereum)` : name;
  }

  getBalance(address: string) {
    // TODO: fix as ''

    return this.currencies[address as ''].reduce((sum, { price, availableInNetworks }) => {
      const sumToken = availableInNetworks.reduce((sumToken, { balance }) => sumToken + balance, 0);
      return price * sumToken + sum;
    }, 0);
  }

  getPercent(address: string) {
    // TODO: fix as ''
    return this.currencies[address as ''].reduce((sum, { grownPercent }) => sum + grownPercent, 0);
  }

  updateSelectedWallet(address: string) {
    this.setSelectedWallet({ selectedWalletAddress: address });

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
