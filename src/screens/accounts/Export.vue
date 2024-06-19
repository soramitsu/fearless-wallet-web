<template>
  <div class="export">
    <div class="description">
      <div class="header" data-testid="headerExport">{{ $t('accounts.exportJson') }}</div>

      <InformationBlock class="information" :text="warningText" />
    </div>

    <div>
      <ValidatedInput
        :value="password"
        errorDescriptions="common.invalidPassword"
        placeholder="accounts.passwordWallet"
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
        text="accounts.wantExportJson"
        data-testid="wantExportJsonBtn"
        :disabled="noEthereumAccount"
        @click="checkPassword"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { useStore, type SelectedWallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { validatePassword } from '@/extension/messaging';

const emit = defineEmits(['setPassword']);
const store = useStore();
const route = useRoute();
const router = useRouter();

const password = ref('');
const isWrongPassword = ref(false);

watch(password, () => {
  isWrongPassword.value = false;
});

const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);
const network = computed(() => route.params.network);

onMounted(() => {
  if (selectedWallet.value.isMobile) router.back();
});

const noEthereumAccount = computed(
  () => selectedWallet.value.ethereumAddress === '' && BaseApi.isEthereumNetwork(network.value)
);

const warningText = computed(() => {
  return noEthereumAccount.value ? 'accounts.notEthereumAccount' : 'accounts.exportWarning';
});

const changePassword = (value: string) => {
  password.value = value;
};

const checkPassword = async () => {
  const addressByNetwork = BaseApi.formatAddress(selectedWallet.value, network.value);
  const validatePass = await validatePassword(addressByNetwork, password.value);

  isWrongPassword.value = !validatePass;

  if (isWrongPassword.value) return;

  emit('setPassword', password.value);
};
</script>

<style lang="scss" scoped>
.export {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-right: 16px;
  height: 100%;

  .information {
    margin-top: 25px;
  }

  .want-export {
    margin: 16px 0;
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .header {
      font-weight: 800;
      font-size: 22px;
    }
  }
}
</style>
