<template>
  <div class="export">
    <div class="description">
      <div class="header" data-testid="headerExport">{{ $t('accounts.exportAccount') }}</div>

      <InformationBlock class="information" :text="warningText" />
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
import { validatePassword } from '@/extension/messaging';
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

const network = computed(() => route.params.network);

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
  const validatePass = await validatePassword(password.value);

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
