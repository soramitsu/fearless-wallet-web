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
import { defineComponent } from 'vue';

import AccountsItem from './AccountsItem.vue';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isSameString } from '@/helpers';

export default defineComponent({ name: 'Account',
  components: { AccountsItem },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      selectedNetwork: '',
      selectedAddress: '',
      newName: '',
    };
  },
  computed: {
    chainAccounts() {
      const networks = this.networksStore.networks.filter(({ ecosystem }) => {
            if (this.isEVM) return isSameString(ecosystem, 'ethereum');

            if (this.isTon) return isSameString(ecosystem, 'ton');

            return isSameString(ecosystem, 'substrate') || isSameString(ecosystem, 'ethereumBased');
          });

          return getChainAccounts(networks, this.accountsStore.selectedWallet);
    },
    isMobile() {
      return !!this.accountsStore.selectedWallet.isMobile;
    },
    type() {
      return this.$route.params.type;
    },
    isEVM() {
      return this.type === 'evm';
    },
    isTon() {
      return this.type === 'ton';
    },
  },
  mounted() {
    this.newName = this.accountsStore.selectedWallet.name;
  },
  methods: {
    back() {
      this.$router.push({ name: Components.Wallet });
    },
    openAccountSettingsPopup(network: string, event: Event) {
      this.$emit('openAccountSettingsPopup', network, event);
    },
    changeNewName(value: string) {
      this.newName = value;
    },
  },
});
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
