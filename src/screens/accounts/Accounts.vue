<template>
  <div class="accounts">
    <AccountsItem
      v-for="{ network, address, networkIcon } in chainAccounts"
      :key="network"
      :network="network"
      :icon="networkIcon"
      :isMobile="isMobile"
      :address="address"
      @openAddEthereumAccountPopup="$emit('openAddEthereumAccountPopup')"
      @openAccountSettingsPopup="openAccountSettingsPopup"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';

import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';

import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { type SelectedWallet } from '@/stores';

@Component({
  components: { AccountsItem },
})
export default class Account extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  get chainAccounts() {
    const networks = this.networksStore.networks.filter(({ name }) => {
      if (this.isEVM) return isNativeEVMNetwork(name);

      return !isNativeEVMNetwork(name);
    });

    return getChainAccounts(networks, this.accountsStore.selectedWallet);
  }

  get isMobile() {
    return !!this.accountsStore.selectedWallet.isMobile;
  }

  get type() {
    return this.$route.params.type;
  }

  get isEVM() {
    return this.type === 'evm';
  }

  get isSubstrate() {
    return this.type === 'substrate';
  }

  @Watch('selectedWallet')
  selectedWalletWatcher({ name }: SelectedWallet) {
    this.newName = name;
  }

  mounted() {
    this.newName = this.accountsStore.selectedWallet.name;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openAccountSettingsPopup(network: string, event: Event) {
    this.$emit('openAccountSettingsPopup', network, event);
  }

  changeNewName(value: string) {
    this.newName = value;
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
}
</style>
