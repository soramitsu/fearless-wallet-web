<template>
  <div class="accounts">
    <FInput
      :value="newName"
      placeholder="accounts.walletName"
      size="big"
      data-testid="walletNameAccounts"
      :maxlength="35"
      @blur="blurInputName"
      @change="changeNewName"
    />

    <InfoRow
      v-for="{ name, count, type } in relayChains"
      data-testid="chainAccounts"
      :text="`${name} ${$t('accounts.chainAccounts')}`"
      :value="count"
      :hideLastBorder="false"
      :hoverIconValue="true"
      :isHoverRow="true"
      :key="count"
      iconValue="chevron-right"
      @click="openChainAccounts(type)"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { accountUpdateName } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isSameString } from '@/helpers';

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();

const newName = ref('');

const relayChains = computed(() => {
  const counterEVM = networksStore.networks.filter(({ ecosystem }) => isSameString(ecosystem, 'ethereum')).length;

  const counterSubstrate = networksStore.networks.filter(
    ({ ecosystem }) => isSameString(ecosystem, 'substrate') || isSameString(ecosystem, 'ethereumBased')
  ).length;

  const counterTon = networksStore.networks.filter(({ ecosystem }) => isSameString(ecosystem, 'ton')).length;

  if (accountsStore.selectedWallet.isTon) {
    return [
      {
        name: 'TON',
        count: counterTon.toString(),
        type: 'ton',
      },
    ];
  }

  return [
    {
      name: 'EVM',
      count: counterEVM.toString(),
      type: 'evm',
    },
    {
      name: 'Substrate',
      count: counterSubstrate.toString(),
      type: 'substrate',
    },
  ];
});

const setInitialName = () => {
  newName.value = accountsStore.selectedWallet.name;
};

onMounted(() => {
  setInitialName();
});

watch(
  () => accountsStore.selectedWallet.name,
  () => {
    setInitialName();
  }
);

const changeNewName = (value: string) => {
  newName.value = value;
};

const blurInputName = () => {
  const { address, name, walletEcosystem } = accountsStore.selectedWallet;

  if (newName.value === '') {
    newName.value = name;

    return;
  }

  accountUpdateName(address, newName.value, walletEcosystem!);
};

const openChainAccounts = (type: string) => {
  router.push({
    name: Components.ChainAccounts,
    params: {
      type,
    },
  });
};
</script>

<style lang="scss" scoped>
.accounts {
  display: flex;
  flex-direction: column;

  .dots {
    margin: auto;
    height: 20px;
    width: 20px;
  }
}
</style>
