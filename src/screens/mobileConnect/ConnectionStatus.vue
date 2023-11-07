<template>
  <div class="connection__status">
    <Icon :icon="icon" className="connection__status-icon" />

    <span class="connection__status-name" :class="nameColorClass">{{ statusHeader }}</span>
    <span class="connection__status-message">{{ message }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n-composable';

type Props = {
  status: 'reset_form' | 'success' | 'failed' | 'wallet_exists' | 'active_account_exists';
};
const props = defineProps<Props>();
const { t } = useI18n();
const translate = (value: string) => t(`mobileConnector.${value}`);

const isSuccess = computed(() => props.status === 'success');
const isFailed = computed(() => props.status === 'failed');
const isActiveAccountExists = computed(() => props.status === 'active_account_exists');
const isWalletExists = computed(() => props.status === 'wallet_exists');

const statusHeader = computed(() => translate(isSuccess.value ? 'connectionSet' : 'connectionFailed'));
const nameColorClass = computed(() => `connection__status-name--${isSuccess.value ? 'success' : 'failed'}`);

const message = computed(() => {
  if (isSuccess.value) return translate('connected');
  if (isFailed.value) return translate('requestDenied');
  if (isWalletExists.value) return translate('walletAlreadyExists');
  if (isActiveAccountExists.value) return translate('activeMobileAccountExists');

  return '';
});

const icon = computed(() =>
  isFailed.value || isWalletExists || isActiveAccountExists ? 'status__failed' : 'status__success'
);
</script>

<style lang="scss" scoped>
.connection__status {
  display: flex;
  flex-flow: column;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 16px;

  .connection__status-message {
    font-size: 18px;
  }

  .connection__status-name {
    font-size: 18px;
    font-weight: 700;
  }

  .connection__status-name--success {
    color: $success-color;
  }

  .connection__status-name--failed {
    color: $reject-color;
  }

  .connection__status-icon {
    width: 60px;
    height: 60px;
  }
}
</style>
