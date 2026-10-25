<template>
  <div v-if="!isSupportedAuthType" class="no-auths" data-testid="unsupportedConnectionType">
    {{ t('authorize.unsupportedConnectionManagement') }}
  </div>
  <div v-else class="connections" :aria-busy="loading || pending">
    <p v-if="readError || actionError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
    <FButton v-if="readError" data-testid="retryConnectionRead" text="ux.retry" @click="load" />
    <p v-else-if="loading" role="status">{{ t('migration.pending') }}</p>
    <template v-else-if="ready">
      <AuthItem
        v-for="request in list"
        :key="request.key"
        :authorizedAccounts="request.authorizedAccounts"
        :url="request.url"
        :disabled="pending"
        @remove="removeAuth(request.key)"
        @openAuthDetails="openAuthDetails(request.key)"
      />
      <div v-if="!list.length" class="no-auths">{{ t('authorize.noconnections') }}</div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import AuthItem from '@/screens/extension-ui/AuthItem.vue';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';
import { useI18n } from '@/locales/useI18n';

const extensionStore = useExtensionStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const type = computed(() => String(route.params.type ?? 'substrate'));
const isSupportedAuthType = computed(() => ['substrate', 'evm'].includes(type.value));
const list = ref<(AuthUrlInfo & { key: string })[]>([]);
const loading = ref(false);
const ready = ref(false);
const pending = ref(false);
const readError = ref(false);
const actionError = ref(false);
let active = true;
let epoch = 0;
onBeforeUnmount(() => {
  active = false;
  epoch++;
});

const load = async () => {
  const owner = ++epoch;
  ready.value = false;
  list.value = [];
  readError.value = false;
  actionError.value = false;
  loading.value = isSupportedAuthType.value;
  if (!active || !isSupportedAuthType.value) return;
  const authType = type.value;
  try {
    await extensionStore.getAuthList();
    if (!active || owner !== epoch) return;
    // Keep displayed rows until the write succeeds. A failed durable revocation can
    // already be vetoed in worker memory; reading that veto must not imply it was saved.
    list.value = Object.entries(extensionStore.authList)
      .filter(([, item]) => ['all', 'both', authType].includes(item.accountAuthType ?? 'substrate'))
      .map(([key, item]) => ({
        ...item,
        key,
        authorizedAccounts:
          authType === 'evm'
            ? item.evmAuthorizedAccount
              ? [item.evmAuthorizedAccount]
              : []
            : [...item.authorizedAccounts],
      }));
    ready.value = true;
  } catch {
    if (active && owner === epoch) readError.value = true;
  } finally {
    if (active && owner === epoch) loading.value = false;
  }
};
watch(type, load, { immediate: true, flush: 'sync' });

const canAct = (id: string) => active && ready.value && !pending.value && list.value.some((item) => item.key === id);
const openAuthDetails = (id: string) => {
  if (!canAct(id)) return;
  void router.push({ name: Components.DAppDetails, params: { id, type: type.value } });
};
const removeAuth = async (id: string) => {
  if (!canAct(id)) return;
  const owner = epoch;
  pending.value = true;
  actionError.value = false;
  try {
    await extensionStore.deleteAuthRequests(id);
    if (active && owner === epoch) list.value = list.value.filter((item) => item.key !== id);
  } catch {
    if (active && owner === epoch) actionError.value = true;
  } finally {
    if (active) pending.value = false;
  }
};
</script>

<style lang="scss" scoped>
.connections {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
