<template>
  <div class="accounts">
    <Input v-model="newName" placeholder="accounts.walletName" size="big" :maxlength="35" @blur="blurInputName" />

    <template>
      <div class="row label">{{ $t('accounts.accountsDefaultSecrets') }}</div>

      <AccountsItem
        v-for="{ network, address, networkIcon } in chainAccounts"
        :key="network"
        :network="network"
        :icon="networkIcon"
        :address="address"
        @openAddEthereumAccountPopup="$emit('openAddEthereumAccountPopup')"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { Vue, Component, Watch } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { accountUpdateName } from '@/extension/messaging';

@Component({
  components: { AccountsItem },
})
export default class Account extends Vue {
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  @Getter(NetworksGettersTypes.getAllNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get chainAccounts() {
    return getChainAccounts(this.networks, this.selectedWallet);
  }

  @Watch('selectedWallet')
  selectedWalletWatcher({ name }: SelectedWallet) {
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

    accountUpdateName(address, this.newName);
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
