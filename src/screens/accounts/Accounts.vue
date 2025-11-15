<template>
  <div class="accounts">
    <AccountsItem
      v-for="{ network, address, networkIcon } in chainAccounts"
      :key="network"
      :network="network"
      :icon="networkIcon"
      :isMobile="isMobile"
      :address="address"
      @openAddEthereumAccountPopup="handleOpenAddEthereumAccountPopup"
      @openAccountSettingsPopup="openAccountSettingsPopup"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AccountsItem from './AccountsItem.vue';
import { getChainAccounts } from '@/helpers/accounts';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isSameString } from '@/helpers';

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();

defineOptions({
  name: 'Account',
});

const type = computed(() => route.params.type as string | undefined);

const isEVM = computed(() => type.value === 'evm');
const isTon = computed(() => type.value === 'ton');

const relevantNetworks = computed(() =>
  networksStore.networks.filter(({ ecosystem }) => {
    if (isEVM.value) return isSameString(ecosystem, 'ethereum');
    if (isTon.value) return isSameString(ecosystem, 'ton');

    return isSameString(ecosystem, 'substrate') || isSameString(ecosystem, 'ethereumBased');
  })
);

const chainAccounts = computed(() => getChainAccounts(relevantNetworks.value, accountsStore.selectedWallet));
const isMobile = computed(() => Boolean(accountsStore.selectedWallet.isMobile));

const emit = defineEmits<{
  openAccountSettingsPopup: [network: string, buttonTop: number];
  openAddEthereumAccountPopup: [];
}>();

const openAccountSettingsPopup = (network: string, buttonTop: number) => {
  emit('openAccountSettingsPopup', network, buttonTop);
};

const handleOpenAddEthereumAccountPopup = () => emit('openAddEthereumAccountPopup');
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
