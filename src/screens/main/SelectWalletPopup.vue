<template>
  <Popup
    :showHeader="false"
    horizontalPlacement="left"
    verticalPlacement="top"
    :top="49"
    :left="42"
    class="select-wallet-popup"
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
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { Components } from '@/router/routes';
import { Currencies } from '@/interfaces/currencies';
import Popup from '@/components/Popup.vue';
import TotalBalance from '@/screens/wallet/TotalBalance.vue';
import keyring from '@polkadot/ui-keyring';
import CurrencyController from '@/controllers/currencyController';

@Component({
  components: {
    Popup,
    TotalBalance,
  },
})
export default class SelectWalletPopup extends Vue {
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: (props: Record<string, string>) => void;

  get wallets() {
    const accounts = keyring.getAccounts();

    return accounts
      .map(({ address }) => {
        const pair = keyring.getPair(address);

        return pair;
      })
      .filter(({ type }) => type !== 'ethereum');
  }

  get currencies(): Currencies {
    return this.networksInfo
      .map(({ balances, assets, name }) => {
        return this.wallets.map(({ address: walletAddress }) => {
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
        });
      })
      .flat();
  }

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  searchCurrenciesByAddress(address: string) {
    return this.currencies.filter(({ walletAddress }) => walletAddress === address);
  }

  getBalance(address: string) {
    const currenciesFilter = this.searchCurrenciesByAddress(address);

    return currenciesFilter.reduce((sum, currency) => {
      const currencyController = new CurrencyController(currency);
      const { totalBalance } = currencyController.getCurrencyInfo();

      return sum + totalBalance;
    }, 0);
  }

  getPercent(address: string) {
    return 5.3;
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
