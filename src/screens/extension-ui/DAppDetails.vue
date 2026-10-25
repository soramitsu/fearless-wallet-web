<template>
  <div v-if="!isSupportedAuthType" class="unsupported-auth" data-testid="unsupportedConnectionDetails">
    {{ t('authorize.unsupportedConnectionManagement') }}
  </div>
  <div v-else class="update-accounts" :aria-busy="loading || pending">
    <p class="connection-origin">{{ url }}</p>
    <p v-if="readError || actionError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
    <FButton v-if="readError" data-testid="retryConnectionRead" text="ux.retry" @click="load" />
    <p v-else-if="loading" role="status">{{ t('migration.pending') }}</p>
    <template v-else-if="ready">
      <SelectAuthAccountForm
        :selectAll="selectAll"
        :accounts="state"
        :authType="authType"
        :showSelectAll="!isEVM"
        :disabled="pending"
        @onSelectAll="onSelectAll"
        @onSelect="onSelect"
      />
      <FButton
        class="connect-button"
        width="100%"
        size="big"
        fontSize="big"
        :disabled="isDisabledApproveBtn"
        :loading="pending"
        :text="buttonText"
        @click="updateAuths"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount, onMounted, onUpdated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AuthType } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';
import { useI18n } from '@/locales/useI18n';

const router = useRouter();
const route = useRoute();
const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();
const { t } = useI18n();
const state = ref<Record<string, WalletInfo>>({});
const loading = ref(false);
const ready = ref(false);
const pending = ref(false);
const readError = ref(false);
const actionError = ref(false);
let active = true;
let epoch = 0;
let renderedEpoch = -1;
onBeforeUnmount(() => {
  active = false;
  epoch++;
});
onMounted(() => {
  renderedEpoch = epoch;
});
onUpdated(() => {
  renderedEpoch = epoch;
});

const routeParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
const authType = computed(() => (routeParam(route.params.type) || 'substrate') as AuthType);
const isSupportedAuthType = computed(() => ['substrate', 'evm'].includes(authType.value));
const isEVM = computed(() => authType.value === 'evm');
const url = computed(() => routeParam(route.params.id));
const accounts = computed(() => accountsStore.accounts.filter((account) => !isEVM.value || !!account.ethereumAddress));
const context = computed(() => JSON.stringify([url.value, authType.value, accounts.value]));
const selected = computed(() => Object.values(state.value).filter(({ active }) => active));
const selectAll = computed(
  () => !!Object.keys(state.value).length && Object.values(state.value).every(({ active }) => active)
);
const isDisabledApproveBtn = computed(() => !ready.value || pending.value || !selected.value.length);
const buttonText = computed(() => ({
  text: actionError.value ? 'ux.retry' : 'authorize.connectCountAccounts',
  localeProps: { count: selected.value.length, tc: selected.value.length === 1 ? 1 : 2 },
}));

const load = async () => {
  const owner = ++epoch;
  ready.value = false;
  state.value = {};
  readError.value = false;
  actionError.value = false;
  loading.value = isSupportedAuthType.value;
  if (!active || !isSupportedAuthType.value) return;
  try {
    await extensionStore.getAuthList();
    if (!active || owner !== epoch) return;
    const entry = extensionStore.authList[url.value];
    if (!entry || !['all', 'both', authType.value].includes(entry.accountAuthType ?? 'substrate'))
      throw new Error('Connection unavailable');
    state.value = Object.fromEntries(
      accounts.value.map(({ name, address, ethereumAddress, isMobile }) => [
        address,
        {
          name,
          address,
          ethereumAddress,
          isMobile,
          active: isEVM.value
            ? ethereumAddress === entry.evmAuthorizedAccount
            : entry.authorizedAccounts.includes(address),
        },
      ])
    );
    ready.value = true;
  } catch {
    if (active && owner === epoch) readError.value = true;
  } finally {
    if (active && owner === epoch) loading.value = false;
  }
};
watch(context, load, { immediate: true, flush: 'sync' });

const canAct = () => active && ready.value && !pending.value && renderedEpoch === epoch;
const onSelect = (value: boolean, address: string) => {
  if (!canAct() || !state.value[address]) return;
  if (isEVM.value)
    Object.values(state.value).forEach((item) => {
      item.active = false;
    });
  state.value[address].active = value;
};
const onSelectAll = (value: boolean) => {
  if (!canAct() || isEVM.value) return;
  Object.values(state.value).forEach((item) => {
    item.active = value;
  });
};
const updateAuths = async () => {
  if (!canAct() || isDisabledApproveBtn.value) return;
  const owner = epoch;
  const addresses = selected.value.map((account) => (isEVM.value ? account.ethereumAddress : account.address));
  const origin = url.value;
  const type = authType.value;
  pending.value = true;
  actionError.value = false;
  try {
    await updateAuthorization(addresses, origin, type);
    // The write acknowledgement is the success boundary. The list screen performs
    // its own read; a later read error must not turn a committed save into a retry.
    if (active && owner === epoch) router.back();
  } catch {
    if (active && owner === epoch) actionError.value = true;
  } finally {
    if (active) pending.value = false;
  }
};
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.connection-origin {
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.unsupported-auth {
  padding: 20px;
  color: $gray-color;
  line-height: 1.45;
}
.connect-button {
  margin-top: 16px;
  flex-shrink: 0;
}
</style>
