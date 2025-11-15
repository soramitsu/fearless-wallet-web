<template>
  <Alert
    v-if="accountsStore.showPolkaswapAlert"
    message="common.readPolkaswapDisclaimer"
    headerMessage="common.disclaimer"
  >
    <div class="alert-content" data-testid="alertContent">
      {{ $t('common.readPolkaswapDisclaimer') }}

      <FButton
        width="85px"
        size="mini"
        fontSize="small"
        type="warning"
        text="common.read"
        data-testid="readBtn"
        :border="false"
        @click="openPolkaswapDisclaimer"
      />
    </div>
  </Alert>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

const accountsStore = useAccountsStore();
const router = useRouter();

function openPolkaswapDisclaimer() {
  router.push({
    name: Components.PolkaswapDisclaimer,
    params: { showSwitcher: '1' },
  });
}
</script>

<style lang="scss" scoped>
.alert-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
