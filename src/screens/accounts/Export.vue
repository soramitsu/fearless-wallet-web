<template>
  <div class="export">
    <div class="description">
      <div class="header" data-testid="headerExport">{{ $t('accounts.exportAccount') }}</div>

      <InformationBlock class="information" :text="warningText" />
      <p v-if="accountsStore.selectedWallet.isTon" class="information">{{ $t('accounts.tonEarlierPassword') }}</p>
    </div>

    <div>
      <ValidatedInput
        :value="password"
        errorDescriptions="common.invalidPassword"
        placeholder="accounts.passwordApp"
        data-testid="passwordExport"
        :isError="isWrongPassword"
        :showPassword="true"
        :readonly="noEthereumAccount"
        @change="changePassword"
      />

      <FButton
        class="want-export"
        size="big"
        fontSize="big"
        width="100%"
        text="accounts.wantExport"
        data-testid="wantExportJsonBtn"
        :disabled="noEthereumAccount"
        @click="checkPassword"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseApi from '@/util/BaseApi';
import { exportMnemonic, getExtensionPassword, validatePassword } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

const emit = defineEmits(['setPassword']);
const accountsStore = useAccountsStore();
const route = useRoute();
const router = useRouter();

const password = ref('');
const isWrongPassword = ref(false);

watch(password, () => {
  isWrongPassword.value = false;
});

// A password typed while one wallet was selected does not export another.
watch(() => accountsStore.selectedWallet.address, () => {
  password.value = '';
});

const network = computed(() => (Array.isArray(route.params.network) ? route.params.network[0] : route.params.network) ?? '');

onMounted(() => {
  if (accountsStore.selectedWallet.isMobile) router.back();
});

const noEthereumAccount = computed(
  () => accountsStore.selectedWallet.ethereumAddress === '' && BaseApi.isEthereumNetwork(network.value)
);

const warningText = computed(() => {
  return noEthereumAccount.value ? 'accounts.notEthereumAccount' : 'accounts.exportWarning';
});

const changePassword = (value: string) => {
  password.value = value;
};

const checkPassword = async () => {
  if (accountsStore.selectedWallet.isTon) {
    const { address, walletEcosystem } = accountsStore.selectedWallet;
    try {
      const { seed } = await exportMnemonic(address, password.value, walletEcosystem);
      const currentPassword = await getExtensionPassword();
      // Recovery must finish before the next export screen uses the current password.
      if (!seed || !currentPassword) throw new Error('Unable to export TON account');
      if (accountsStore.selectedWallet.address !== address) return;
      isWrongPassword.value = false;
      emit('setPassword', currentPassword);
    } catch {
      if (accountsStore.selectedWallet.address === address) isWrongPassword.value = true;
    }
    return;
  }

  const { address } = accountsStore.selectedWallet;
  const validatePass = await validatePassword(password.value);

  if (accountsStore.selectedWallet.address !== address) return;

  isWrongPassword.value = !validatePass;

  const pass = isWrongPassword.value ? '' : password.value;

  emit('setPassword', pass);
};
</script>

<style lang="scss" scoped>
.export {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .information {
    margin-top: 25px;
  }

  .want-export {
    margin-top: 16px;
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .header {
      font-weight: 800;
      font-size: 1.375em;
    }
  }
}
</style>
