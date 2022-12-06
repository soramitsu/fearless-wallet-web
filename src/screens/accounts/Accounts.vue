<template>
  <div class="accounts">
    <Input v-model="newName" placeholder="accounts.walletName" size="big" :maxlength="35" @blur="blurInputName" />

    <template v-if="showReplacedAccounts">
      <div class="row label">{{ $t('accounts.accountsUniquesSecrets') }}</div>

      <AccountsItem
        v-for="{ network, asset, address } in replacedAccountsItems"
        :key="network"
        :network="network"
        :asset="asset"
        :address="address"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template>

    <template v-if="showSharedSecretAccounts">
      <div class="row label">{{ $t('accounts.accountsDefaultSecrets') }}</div>

      <AccountsItem
        v-for="{ network, asset, address } in sharedAccountsItems"
        :key="network"
        :network="network"
        :asset="asset"
        :address="address"
        :isMobile="isMobileWallet"
        @openSourceTypePopup="$emit('openSourceTypePopup')"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Getter, Mutation } from 'vuex-class';
import { Vue, Component, Watch } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';
import type { SelectedWallet, SetSelectedWalletProps } from '@/store';
import type { Networks, TMutation } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import BaseApi from '@/util/BaseApi';

@Component({
  components: { AccountsItem },
})
export default class Account extends Vue {
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get showReplacedAccounts() {
    return this.replacedAccountsItems.length > 0;
  }

  get isMobileWallet() {
    return BaseApi.isMobileWallet(this.selectedWallet.address);
  }

  get showSharedSecretAccounts() {
    return this.sharedAccountsItems.length > 0;
  }

  get chainAccounts() {
    return getChainAccounts(this.networks, this.selectedWallet);
  }

  get replacedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.chainAccounts.filter(({ isReplaced }) => isReplaced);
  }

  get sharedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.chainAccounts.filter(({ isReplaced }) => !isReplaced);
  }

  @Watch('selectedWallet')
  ethereumJsonChanged({ name }: SelectedWallet) {
    this.newName = name;
  }

  mounted() {
    this.newName = this.selectedWallet.name;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openAccountSettingsPopup(network: string, event: Event) {
    this.$emit('openAccountSettingsPopup', network, event);
  }

  blurInputName() {
    const { address, name } = this.selectedWallet;

    if (this.newName === '') {
      this.newName = name;

      return;
    }

    BaseApi.updateWalletName(address, this.newName);

    this.setSelectedWallet({ selectedWalletAddress: address });
  }
}
</script>

<style lang="scss" scoped>
.accounts {
  display: flex;
  flex-direction: column;
  margin-right: 16px;

  .row {
    margin-top: 16px;
  }

  .label {
    color: rgba(255, 255, 255, 1);
    text-align: left;
    font-weight: 600;
  }
}
</style>
