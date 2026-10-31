<template>
  <dialog
    v-if="status && open"
    ref="dialog"
    class="wallet-password"
    aria-labelledby="wallet-password-title"
    aria-describedby="wallet-password-description"
    data-testid="universalWalletPasswordNotice"
    @cancel.prevent="later"
  >
    <div class="wallet-password__heading">
      <span class="wallet-password__label">{{ t('label') }}</span>
      <button type="button" class="wallet-password__close" :aria-label="t('close')" @click="later">
        <Icon icon="close" width="20px" height="20px" :hover="false" />
      </button>
    </div>

    <template v-if="status.state === 'password-unknown'">
      <h1 id="wallet-password-title" tabindex="-1">{{ t('unknownTitle') }}</h1>
      <p id="wallet-password-description" class="wallet-password__description">{{ t('unknownDescription') }}</p>
      <label class="wallet-password__path">
        <span>{{ t('pathLabel') }}</span>
        <input
          v-model="derivationPath"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('pathPlaceholder')"
          data-testid="universalWalletPasswordPath"
          @keydown.enter.prevent="addPath"
        />
      </label>
      <p v-if="error" class="wallet-password__error" role="alert">{{ t(error) }}</p>
      <div class="wallet-password__actions">
        <button type="button" class="wallet-password__primary" :disabled="busy || !derivationPath.trim()" @click="addPath">
          {{ t('continue') }}
        </button>
        <button type="button" class="wallet-password__secondary" data-testid="universalWalletNoPassword" @click="later">
          {{ t('noPassword') }}
        </button>
      </div>
    </template>

    <template v-else-if="status.state === 'legacy'">
      <h1 id="wallet-password-title" tabindex="-1">{{ t('title') }}</h1>
      <p id="wallet-password-description" class="wallet-password__description">{{ t('description') }}</p>
      <ul class="wallet-password__rows">
        <li v-for="row in status.rows" :key="row.network" :data-testid="`universalWalletPassword-${row.network}`">
          <strong>{{ t(row.network) }}</strong>
          <span class="wallet-password__address">{{ t('oldAddress') }}: {{ row.legacyAddress }}</span>
          <span v-if="row.protectedAddress" class="wallet-password__address">
            {{ t('newAddress') }}: {{ row.protectedAddress }}
            <button type="button" class="wallet-password__copy" @click="copy(row.protectedAddress)">
              {{ t(copied === row.protectedAddress ? 'copied' : 'copy') }}
            </button>
          </span>
          <span v-if="outcomes[row.network]" class="wallet-password__outcome" role="status">
            {{ t(outcomeText[outcomes[row.network]!]) }}
          </span>
        </li>
      </ul>
      <p v-if="error" class="wallet-password__error" role="alert">{{ t(error) }}</p>
      <div class="wallet-password__actions">
        <button
          type="button"
          class="wallet-password__primary"
          :disabled="busy"
          :aria-busy="busy"
          data-testid="universalWalletPasswordSwitch"
          @click="switchAccounts"
        >{{ t(busy ? 'switching' : 'switch') }}</button>
        <button type="button" class="wallet-password__secondary" @click="later">{{ t('later') }}</button>
      </div>
    </template>

    <template v-else>
      <h1 id="wallet-password-title" tabindex="-1">{{ t('title') }}</h1>
      <p id="wallet-password-description" class="wallet-password__description" role="status">{{ t('protected') }}</p>
      <div class="wallet-password__actions">
        <button type="button" class="wallet-password__primary" @click="later">{{ t('done') }}</button>
      </div>
    </template>
  </dialog>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  UniversalWalletPasswordStatus,
  UniversalWalletPasswordSwitchResult,
} from '@extension-base/background/types/types';
import type { UniversalWalletPasswordNetwork } from '@/util/universalWalletPassphrase';
import Icon from '@/components/Icon.vue';
import { IS_EXTENSION } from '@/consts/global';
import { setClipboard } from '@/helpers';
import {
  addUniversalWalletPasswordPath,
  switchUniversalWalletAccounts,
  universalWalletPasswordStatus,
} from '@/extension/messaging';
import { universalWalletPasswordMessages } from '@/locales/universalWalletPassword';
import { useAccountsStore } from '@/stores/accounts';
import {
  needsUniversalWalletPasswordNotice,
  readClosedUniversalWalletPasswordNotices,
  rememberClosedUniversalWalletPasswordNotice,
  universalWalletPasswordNoticeRequest,
} from '@/util/universalWalletPasswordNotice';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

type MessageKey = keyof (typeof universalWalletPasswordMessages)['en-EN'];

const { t } = useI18n({
  useScope: 'local',
  inheritLocale: false,
  locale: 'en-EN',
  messages: universalWalletPasswordMessages,
  fallbackLocale: 'en-EN',
  fallbackWarn: false,
  missingWarn: false,
});
const outcomeText: Record<UniversalWalletPasswordSwitchResult['outcome'], MessageKey> = {
  switched: 'switched',
  funded: 'stillFunded',
  unknown: 'unchecked',
};

const accountsStore = useAccountsStore();
const dialog = ref<HTMLDialogElement>();
const status = ref<UniversalWalletPasswordStatus>();
const open = ref(false);
const active = ref(true);
const busy = ref(false);
const error = ref<MessageKey | ''>('');
const derivationPath = ref('');
const copied = ref('');
const outcomes = ref<Partial<Record<UniversalWalletPasswordNetwork, UniversalWalletPasswordSwitchResult['outcome']>>>({});
let revision = 0;

const address = computed(() => accountsStore.selectedWallet.address);
// An old (recovery-only) wallet already carries its one warning: move everything to a new wallet.
const recoveryOnly = computed(() => IS_EXTENSION && isSelectedWalletRecoveryOnly(accountsStore.accounts, address.value));

const reset = () => {
  revision += 1;
  open.value = false;
  busy.value = false;
  error.value = '';
  derivationPath.value = '';
  copied.value = '';
  outcomes.value = {};
};

const load = async () => {
  reset();
  const current = revision;
  const wallet = address.value;
  // Asked for again from wallet details: shown even after it was closed.
  const requested = !!wallet && universalWalletPasswordNoticeRequest.value === wallet;

  if (requested) universalWalletPasswordNoticeRequest.value = null;
  if (!wallet || recoveryOnly.value) return;
  if (!requested && readClosedUniversalWalletPasswordNotices().includes(wallet)) return;

  try {
    const next = await universalWalletPasswordStatus(wallet);

    if (current !== revision || !active.value) return;
    status.value = next;
    open.value = needsUniversalWalletPasswordNotice(next);
    if (open.value) {
      await nextTick();
      dialog.value?.showModal();
    }
  } catch {
    // Without an answer the wallet shows nothing new; it is asked again next time.
  }
};

const later = () => {
  if (address.value) rememberClosedUniversalWalletPasswordNotice(address.value);
  dialog.value?.close();
  reset();
};

const copy = (value: string) => {
  setClipboard(value);
  copied.value = value;
};

const addPath = async () => {
  if (busy.value || !derivationPath.value.trim()) return;
  const current = revision;
  busy.value = true;
  error.value = '';
  try {
    const result = await addUniversalWalletPasswordPath(address.value, derivationPath.value);

    if (current !== revision) return;
    if ('status' in result) {
      status.value = result.status;
      derivationPath.value = '';
      if (!needsUniversalWalletPasswordNotice(result.status)) later();
      return;
    }
    error.value = result.code === 'path_mismatch' ? 'pathMismatch' : result.code === 'no_password' ? 'pathWithoutPassword' : 'failed';
  } catch {
    if (current === revision) error.value = 'failed';
  } finally {
    if (current === revision) busy.value = false;
  }
};

const switchAccounts = async () => {
  if (busy.value) return;
  const current = revision;
  busy.value = true;
  error.value = '';
  try {
    const results = await switchUniversalWalletAccounts(address.value);

    if (current !== revision) return;
    outcomes.value = Object.fromEntries(results.map(({ network, outcome }) => [network, outcome]));
    if (results.some(({ outcome }) => outcome === 'switched')) {
      const next = await universalWalletPasswordStatus(address.value);

      if (current !== revision) return;
      // Rows that moved disappear; their outcome stays visible above the remaining ones.
      status.value = next;
    }
  } catch {
    if (current === revision) error.value = 'failed';
  } finally {
    if (current === revision) busy.value = false;
  }
};

watch([address, recoveryOnly], () => void load(), { immediate: true });
// A request for another wallet waits for that wallet to become selected (the address watcher takes it).
watch(universalWalletPasswordNoticeRequest, (requested) => {
  if (requested && requested === address.value) void load();
});
onActivated(() => { active.value = true; });
onDeactivated(() => {
  active.value = false;
  dialog.value?.close();
  reset();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  reset();
});
</script>

<style lang="scss" scoped>
.wallet-password {
  box-sizing: border-box;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 20px 24px 16px;
  overflow-y: auto;
  border: 1px solid $fw-strong-edge;
  border-radius: 16px;
  background: $fw-panel-surface;
  color: $plain-white;
  font-family: var(--s-font-family-default);
  text-align: left;
  box-shadow: 0 20px 64px var(--fw-scrim);

  &::backdrop {
    background: var(--fw-scrim);
    backdrop-filter: blur(5px);
  }

  h1 {
    margin: 8px 0;
    font-size: 1.25rem;
  }

  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__label {
    color: var(--fw-text-2);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  &__close,
  &__copy {
    border: 0;
    background: transparent;
    color: var(--fw-link);
    font: inherit;
    cursor: pointer;
  }

  &__description,
  &__error,
  &__outcome {
    margin: 0 0 12px;
    font-size: 0.875rem;
    line-height: 1.45;
  }

  &__error {
    color: var(--fw-danger);
  }

  &__rows {
    display: grid;
    gap: 12px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;

    li {
      display: grid;
      gap: 4px;
      padding: 12px;
      border: 1px solid var(--fw-divider);
      border-radius: 8px;
    }
  }

  &__address {
    font-family: monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  &__outcome {
    margin: 0;
    color: var(--fw-warning);
  }

  &__path {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 0.875rem;

    input {
      padding: 10px 12px;
      border: 1px solid var(--fw-divider);
      border-radius: 8px;
      background: var(--fw-raised);
      color: inherit;
      font: inherit;
    }
  }

  &__actions {
    display: grid;
    gap: 8px;
  }

  &__primary,
  &__secondary {
    min-height: 40px;
    border-radius: 20px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  &__primary {
    border: 0;
    background: $fw-primary-fill;
    color: $fw-on-accent;

    &:hover { background: $fw-secondary-hover; }
    &:disabled { opacity: 0.65; cursor: default; }
  }

  &__secondary {
    border: 1px solid var(--fw-divider);
    background: transparent;
    color: $grayish-white;

    &:hover { background: $secondary-background-color; }
  }
}
</style>
