<template>
  <AboveForm header="browserTabs.authorize" :fullScreen="true" :showCloseIcon="!pending" @closeHandler="onReject">
    <div class="authorize" :aria-busy="!!pending">
      <p v-if="actionError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
      <p v-if="!request" role="status">{{ t('irohaConnectPage.waitingForRequest') }}</p>
      <template v-else-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content">
              <span
                v-for="(part, index) in messageParts"
                :key="`${part.kind}-${index}`"
                :class="getMessagePartClass(part)"
              >
                {{ getMessagePartText(part) }}
              </span>
            </p>
          </Alert>

          <div class="authorize-account-list">
            <SelectAuthAccountForm
              :selectAll="selectAll"
              :showSelectAll="showSelectAll"
              :accounts="state"
              :authType="accountAuthType"
              :disabled="!!pending"
              @onSelectAll="onSelectAll"
              @onSelect="onSelect"
            />
          </div>
        </div>

        <div ref="controls" class="authorize__control">
          <FButton
            data-testid="rejectAuthorization"
            text="common.reject"
            type="secondary"
            size="big"
            fontSize="big"
            :disabled="!!pending"
            :loading="pending === 'reject'"
            @click="onReject"
          />
          <FButton
            width="100%"
            text="common.approve"
            size="big"
            fontSize="big"
            :disabled="isDisabledApproveBtn"
            :loading="pending === 'approve'"
            :focusableWhenDisabled="true"
            :disabledReason="pending ? 'migration.pending' : 'migration.selectWallets'"
            data-testid="approveAuthorization"
            @click="onApprove"
          />
        </div>
      </template>

      <template v-else>
        <Alert message="auth.noAccounts" />

        <FButton
          width="100%"
          text="common.understood"
          size="big"
          fontSize="big"
          :disabled="!!pending"
          @click="onReject"
        />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { type AuthorizeMessagePart, splitAuthorizeMessage } from './messageParts';
import type { AccountJson } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';

const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);
const pending = ref<'approve' | 'reject' | null>(null);
const actionError = ref(false);
const controls = ref<HTMLElement | null>(null);
let active = true;
let mounted = false;
let renderedRequestKey = '';
let renderedAccountsKey = '';
let selectionKey = '';
onBeforeUnmount(() => {
  active = false;
});

const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const { t } = useI18n();

const requests = computed(() => extensionStore.authRequests);
const request = computed(() => requests.value[0]);
const requestKey = computed(() => (request.value ? JSON.stringify(request.value) : ''));
const accountAuthType = computed(() => request.value?.request?.accountAuthType);
const allowedAccounts = computed(() => new Set(request.value?.request.allowedAccounts ?? []));

const accounts = computed<AccountJson[]>(() => {
  const accounts: AccountJson[] = accountsStore.accounts;

  return accounts.filter((account) => {
    const { ethereumAddress, solanaAddress, walletEcosystem } = account;

    if (accountAuthType.value === 'substrate' && walletEcosystem === WalletEcosystem.Evm) return false;
    if (accountAuthType.value === 'evm' && !ethereumAddress) return false;
    if (accountAuthType.value === 'solana') return !!solanaAddress || walletEcosystem === WalletEcosystem.Solana;
    if (accountAuthType.value === 'iroha') return !!resolveIrohaAuthAddress(account, allowedAccounts.value);

    return true;
  });
});

const accountsKey = computed(() => JSON.stringify(accounts.value));

const showSelectAll = computed(
  () => accountAuthType.value !== 'evm' && accountAuthType.value !== 'solana' && accountAuthType.value !== 'iroha'
);
const isDisabledApproveBtn = computed(
  () => !request.value || !!pending.value || !Object.values(state.value).some(({ active }) => active)
);
const isAccountsExists = computed(() => accounts.value.length > 0);

const isAllSelected = () => Object.values(state.value).every(({ active }) => active);

const refreshSelection = () => {
  const sameRequest = selectionKey === requestKey.value;
  const previous = sameRequest ? state.value : {};
  const next: Record<string, WalletInfo> = {};
  selectionKey = requestKey.value;

  accounts.value.forEach((account) => {
    const { name, address, ethereumAddress, irohaAddress, isMobile, solanaAddress, walletEcosystem } = account;
    const authAddress =
      accountAuthType.value === 'solana' && solanaAddress
        ? solanaAddress
        : accountAuthType.value === 'solana' && walletEcosystem === WalletEcosystem.Solana
          ? address
          : accountAuthType.value === 'iroha'
            ? (resolveIrohaAuthAddress(account, allowedAccounts.value) ?? address)
            : address;

    next[authAddress] = {
      name,
      address: authAddress,
      ethereumAddress,
      irohaAddress: accountAuthType.value === 'iroha' ? authAddress : irohaAddress,
      solanaAddress,
      isMobile,
      active:
        previous[authAddress]?.ethereumAddress === ethereumAddress &&
        previous[authAddress]?.solanaAddress === solanaAddress &&
        previous[authAddress]?.irohaAddress === (accountAuthType.value === 'iroha' ? authAddress : irohaAddress)
          ? (previous[authAddress]?.active ?? showSelectAll.value)
          : showSelectAll.value,
    };
  });

  state.value = next;
  selectAll.value = isAllSelected();
};

const onSelect = (value: boolean, address: string) => {
  if (!active || pending.value || !request.value || !state.value[address]) return;
  if (!showSelectAll.value) Object.keys(state.value).forEach((key) => (state.value[key].active = false));

  state.value[address].active = value;

  if (showSelectAll.value) selectAll.value = isAllSelected();
};

const onSelectAll = (value: boolean) => {
  if (!active || pending.value || !request.value || !showSelectAll.value) return;
  Object.keys(state.value).forEach((key) => {
    state.value[key] = {
      ...state.value[key],
      active: value,
    };
  });

  selectAll.value = value;
};

const requestOrigin = computed(() => request.value?.request.origin ?? '');
const requestUrl = computed(() => request.value?.url ?? '');
const messageParts = computed(() =>
  splitAuthorizeMessage(
    t('authorize.authWarningMessage', {
      name: '{name}',
      link: '{link}',
    })
  )
);

const getMessagePartClass = (part: AuthorizeMessagePart) => {
  if (part.kind === 'name') return 'authorize__content--name';
  if (part.kind === 'link') return 'authorize__content--link';

  return undefined;
};

const getMessagePartText = (part: AuthorizeMessagePart) => {
  if (part.kind === 'name') return requestOrigin.value;
  if (part.kind === 'link') return requestUrl.value;

  return part.text;
};

const actOnRequest = async (action: 'approve' | 'reject') => {
  if (
    !active ||
    pending.value ||
    !request.value ||
    renderedRequestKey !== requestKey.value ||
    renderedAccountsKey !== accountsKey.value ||
    selectionKey !== requestKey.value
  )
    return;
  if (action === 'approve' && isDisabledApproveBtn.value) return;
  const { id } = request.value;
  const key = requestKey.value;
  const accounts = Object.values(state.value)
    .filter(({ active }) => active)
    .map(({ address }) => address);
  pending.value = action;
  actionError.value = false;
  try {
    if (action === 'approve') await extensionStore.approveAuthRequests({ id, accounts });
    else await extensionStore.rejectAuthRequests(id);
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

const resolveIrohaAuthAddress = (
  { address, irohaAddress, irohaPublicKeyHex, walletEcosystem }: AccountJson,
  allowed: Set<string>
): string | undefined => {
  const candidates = [irohaAddress, address, ...deriveIrohaAddresses(irohaPublicKeyHex)].filter(
    (value): value is string => !!value
  );

  if (allowed.size > 0) return candidates.find((candidate) => allowed.has(candidate));

  return walletEcosystem === WalletEcosystem.Iroha ? candidates[0] : irohaAddress;
};

const deriveIrohaAddresses = (publicKeyHex?: string): string[] => {
  if (!publicKeyHex) return [];

  try {
    return [encodeIrohaI105Address(publicKeyHex, 'nexus'), encodeIrohaI105Address(publicKeyHex, 'taira')];
  } catch {
    return [];
  }
};

const focusReject = async () => {
  const key = requestKey.value;
  await nextTick();
  if (active && key === requestKey.value)
    controls.value?.querySelector<HTMLButtonElement>('[data-testid="rejectAuthorization"] button')?.focus();
};
const leaveEmptyRequest = () => {
  if (!active || request.value || router.currentRoute.value.name !== Components.Authorize) return;
  void router.push({ name: Components.Wallet }).catch(() => {
    if (active) actionError.value = true;
  });
};
watch(
  [requestKey, accounts],
  () => {
    const changedRequest = selectionKey !== requestKey.value;
    refreshSelection();
    if (changedRequest) {
      actionError.value = false;
      if (mounted) void focusReject();
    }
    if (mounted) leaveEmptyRequest();
  },
  { immediate: true, deep: true, flush: 'sync' }
);
// Old controls cannot respond to a new request or account inventory before its DOM update.
watch(
  [requestKey, accountsKey],
  ([key, inventory]) => {
    renderedRequestKey = key;
    renderedAccountsKey = inventory;
  },
  { flush: 'post' }
);
onMounted(() => {
  mounted = true;
  renderedRequestKey = requestKey.value;
  renderedAccountsKey = accountsKey.value;
  leaveEmptyRequest();
  void focusReject();
});
</script>

<style lang="scss">
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
  overflow-y: auto;
  gap: 16px;

  .authorize__content {
    font-size: 0.875em;
    line-height: 21px;
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .authorize__content--name {
    color: $pink-lavender-color;
  }

  .authorize__content--link {
    color: $pink-lavender-color;
    font-family: var(--fw-font-mono);
  }

  .authorize__control {
    display: flex;
    flex-flow: row wrap;
    gap: 12px;
    > * {
      flex: 1 1 200px;
      min-width: 0;
    }
  }

  .authorize-account-list {
    min-height: 120px;
  }
}
</style>
