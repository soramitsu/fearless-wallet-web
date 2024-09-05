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
import { Getter } from 'vuex-class';
import { Vue, Component, Watch } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';

@Component({
  components: { AccountsItem },
})
export default class Account extends Vue {
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get chainAccounts() {
    const networks = this.networks.filter(({ name }) => {
      if (this.isEVM) return isNativeEVMNetwork(name);

      return !isNativeEVMNetwork(name);
    });

    return getChainAccounts(networks, this.selectedWallet);
  }

  get isMobile() {
    return !!this.selectedWallet.isMobile;
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
    this.newName = this.selectedWallet.name;
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
