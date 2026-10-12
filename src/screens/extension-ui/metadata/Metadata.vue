<template>
  <AboveForm :fullScreen="true" header="metadata.text" :showCloseIcon="!pending" @closeHandler="onReject">
    <div class="meta-content" :aria-busy="!!pending">
      <p v-if="actionError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
      <p v-if="!request" role="status">{{ t('irohaConnectPage.waitingForRequest') }}</p>
      <template v-else>
        <div class="metadata-review">
          <dl class="metadata-fields">
            <dt>{{ t('common.network') }}</dt>
            <dd>{{ request.request.chain || t('portfolioPage.unknownNetwork') }}</dd>
            <dt>{{ t('historyDetails.blockHash') }} · 0</dt>
            <dd class="metadata-identifier">{{ request.request.genesisHash }}</dd>
            <dt>{{ t('irohaConnectPage.app') }}</dt>
            <dd class="metadata-identifier">{{ request.url }}</dd>
          </dl>
          <Alert message="metadata.alertMessage" />
          <details
            :key="requestKey"
            class="metadata-payload"
            @toggle="rawExpanded = ($event.target as HTMLDetailsElement).open"
          >
            <summary>{{ t('irohaConnectPage.payload') }}</summary>
            <pre v-if="rawExpanded">{{ rawPayload }}</pre>
          </details>
        </div>
        <div ref="controls" class="metadata-controls">
          <FButton
            text="common.reject"
            data-testid="rejectMetadata"
            type="secondary"
            size="big"
            fontSize="big"
            :disabled="!!pending"
            :loading="pending === 'reject'"
            @click="onReject"
          />
          <FButton
            text="common.approve"
            data-testid="approveMetadata"
            size="big"
            fontSize="big"
            :disabled="!!pending"
            :loading="pending === 'approve'"
            :focusableWhenDisabled="true"
            disabledReason="migration.pending"
            @click="onApprove"
          />
        </div>
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { useI18n } from '@/locales/useI18n';
import { useExtensionStore } from '@/stores/extension';

const extensionStore = useExtensionStore();
const router = useRouter();
const { t } = useI18n();
const request = computed(() => extensionStore.metaRequests[0]);
const requestKey = computed(() => (request.value ? JSON.stringify(request.value) : ''));
const rawExpanded = ref(false);
const rawPayload = computed(() => (request.value ? JSON.stringify(request.value.request, null, 2) : ''));
const pending = ref<'approve' | 'reject' | null>(null);
const actionError = ref(false);
const controls = ref<HTMLElement | null>(null);
let active = true;
let mounted = false;
let renderedRequestKey = '';
onBeforeUnmount(() => {
  active = false;
});

const focusReject = async () => {
  const key = requestKey.value;
  await nextTick();
  if (active && key === requestKey.value)
    controls.value
      ?.querySelector<HTMLButtonElement>('[data-testid="rejectMetadata"] button')
      ?.focus({ preventScroll: true });
};
const leaveEmptyRequest = () => {
  if (!active || request.value || router.currentRoute.value.name !== Components.MetaRequest) return;
  void router.push({ name: Components.Wallet }).catch(() => {
    if (active) actionError.value = true;
  });
};
const actOnRequest = async (action: 'approve' | 'reject') => {
  if (!active || pending.value || !request.value || renderedRequestKey !== requestKey.value) return;
  const captured = request.value;
  const key = requestKey.value;
  pending.value = action;
  actionError.value = false;
  try {
    if (action === 'approve') await extensionStore.approveMetaRequests(captured);
    else await extensionStore.rejectMetaRequests(captured);
  } catch {
    if (active && requestKey.value === key) actionError.value = true;
  } finally {
    if (active) {
      pending.value = null;
      if (requestKey.value !== key) void focusReject();
    }
  }
};
const onApprove = () => actOnRequest('approve');
const onReject = () => actOnRequest('reject');
watch(
  requestKey,
  () => {
    actionError.value = false;
    rawExpanded.value = false;
    if (mounted) {
      leaveEmptyRequest();
      void focusReject();
    }
  },
  { flush: 'sync' }
);
// Old controls cannot respond to a replacement until its DOM update has finished.
watch(
  requestKey,
  (key) => {
    renderedRequestKey = key;
  },
  { flush: 'post' }
);
onMounted(() => {
  mounted = true;
  renderedRequestKey = requestKey.value;
  leaveEmptyRequest();
  void focusReject();
});
</script>

<style lang="scss" scoped>
.meta-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}
.metadata-review {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.metadata-fields {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 16px;
  background: var(--fw-raised);
  border: 1px solid var(--fw-stroke-control);
  border-radius: 16px;
  text-align: left;
  dt {
    color: var(--fw-text-2);
    font-weight: 700;
  }
  dd {
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
}
.metadata-identifier {
  font-family: var(--fw-font-mono);
}
.metadata-payload {
  min-width: 0;
  text-align: left;
  summary {
    min-height: 48px;
    padding: 12px;
    box-sizing: border-box;
    cursor: pointer;
  }
  summary:focus-visible {
    outline: 2px solid var(--fw-focus);
  }
  pre {
    max-height: 260px;
    overflow: auto;
    padding: 12px;
    margin: 0;
    font-family: var(--fw-font-mono);
    background: var(--fw-sunken);
    border-radius: 12px;
  }
}
.metadata-controls {
  display: flex;
  flex-flow: row wrap;
  gap: 12px;
  margin-top: auto;
  > * {
    flex: 1 1 200px;
    min-width: 0;
  }
}
</style>
