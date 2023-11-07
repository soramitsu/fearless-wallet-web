<template>
  <Popup
    :isIcon="isPendingWithResetForm"
    :sizeWidth="320"
    :headerType="status"
    :headerText="header"
    :showBorder="true"
    @handlerClose="onClose"
  >
    <div v-if="isPendingWithResetForm" class="reset__form">
      <span class="message">{{ $t('mobileConnector.noAnswer') }}</span>

      <FButton
        size="big"
        type="primary"
        :border="false"
        width="180"
        text="mobileConnector.cancelRequest"
        @click="onCancelRequest"
      />

      <FButton size="big" type="secondary" :border="false" text="mobileConnector.resetConnection" @click="() => {}" />
    </div>

    <ConnectionStatus v-else-if="isRequestFinished" :status="status" @close="onClose" />
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import ConnectionStatus from './ConnectionStatus.vue';
import { Components } from '@/router/routes';

type Props = {
  requestResponse?: object | null;
  status: 'reset_form' | 'success' | 'failed' | 'wallet_exists' | 'active_account_exists';
};
const props = withDefaults(defineProps<Props>(), { requestResponse: null });
const router = useRouter();

const isSuccess = computed(() => props.status === 'success');
const isFailed = computed(() => props.status === 'failed');
const isActiveAccountExists = computed(() => props.status === 'active_account_exists');
const isWalletExists = computed(() => props.status === 'wallet_exists');
const isRequestFinished = computed(() => isSuccess.value || isFailed || isWalletExists || isActiveAccountExists);
const isPendingWithResetForm = computed(() => props.status === 'reset_form');

const header = computed(() => {
  if (isRequestFinished.value) return '';

  return `No answer from wallet`;
});

const toWalletScreen = () => router.push({ name: Components.Wallet });
const onClose = () => (isSuccess.value || isActiveAccountExists ? toWalletScreen() : router.back());
const onCancelRequest = () => router.push({ name: Components.Wallet });
</script>

<style lang="scss" scoped>
.header {
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.message {
  color: $gray-color;
  font-weight: 400;
  font-size: 16px;
  line-height: 147.5%;
}
.icon {
  width: 40px;
  height: 40px;
  margin-left: 6px;
  margin-right: 6px;
}

.content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reset__form {
  display: flex;
  flex-flow: column;
  gap: 10px;
  padding: 16px;
}

.FCorners__container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: $default-border;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
}
</style>
