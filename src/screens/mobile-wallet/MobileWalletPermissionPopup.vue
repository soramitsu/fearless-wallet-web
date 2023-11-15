<template>
  <Popup :isIcon="true" :sizeWidth="320" :headerType="status" headerText="" :showBorder="true" @handlerClose="onClose">
    <div class="connection__status">
      <Icon icon="status__failed" className="connection__status-icon" />

      <span class="connection__status-name connection__status-name--failed">{{
        $t('mobileConnector.connectionFailed')
      }}</span>
      <span class="connection__status-message">{{ $t('mobileConnector.walletAlreadyExists') }}</span>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router/composables';
import { Components } from '@/router/routes';

type Props = {
  requestResponse?: object | null;
  status: 'wallet_exists';
};
withDefaults(defineProps<Props>(), { requestResponse: null });
const router = useRouter();

const toWalletScreen = () => router.push({ name: Components.Wallet });
const onClose = () => toWalletScreen();
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
