<template>
  <AboveForm :fullScreen="true" header="accountAccess.title" @closeHandler="close">
    <Scroll>
      <div class="account-access">
        <div class="account-access__rows">
          <p class="account-access__explain">{{ t('accountAccess.description') }}</p>

          <Loader v-if="isLoading" />

          <div v-else-if="loadFailed" class="account-access__notice" role="alert" data-testid="accessLoadFailed">
            <span>{{ t('accountAccess.loadFailed') }}</span>
            <FButton text="ux.retry" size="small" fontSize="small" type="secondary" @click="load" />
          </div>

          <p v-else-if="!rows.length" class="account-access__notice" role="status" data-testid="allUnlocked">
            {{ t('accountAccess.allUnlocked') }}
          </p>

          <section
            v-for="row in rows"
            :key="row.address"
            class="access-row"
            data-testid="accessRow"
            :data-address="row.address"
          >
            <strong class="access-row__name">{{ rowName(row) }}</strong>
            <span class="access-row__address">{{ row.address }}</span>
            <span class="access-row__hint">{{ t(row.usePhrase ? 'accountAccess.phraseHint' : hintKey(row)) }}</span>

            <ValidatedInput
              :value="row.secret"
              :type="row.usePhrase ? 'textarea' : 'text'"
              :showPassword="!row.usePhrase"
              :maxlength="row.usePhrase ? 1000 : 200"
              :placeholder="row.usePhrase ? 'accountAccess.phrasePlaceholder' : 'accountAccess.passwordPlaceholder'"
              :isError="!!row.errorKey"
              :errorDescriptions="row.errorKey"
              data-testid="accessSecret"
              @change="setSecret(row, $event)"
              @pressEnter="unlock(row)"
            />

            <div class="access-row__actions">
              <FButton
                text="accountAccess.unlock"
                size="small"
                fontSize="small"
                :disabled="row.isBusy || !row.secret.trim()"
                data-testid="accessUnlock"
                @click="unlock(row)"
              />
              <button type="button" class="access-row__switch" data-testid="accessMode" @click="toggleMode(row)">
                {{ t(row.usePhrase ? 'accountAccess.usePassword' : 'accountAccess.usePhrase') }}
              </button>
            </div>
          </section>
        </div>

        <FButton
          size="big"
          fontSize="big"
          width="100%"
          :type="rows.length ? 'secondary' : undefined"
          :text="rows.length ? 'accountAccess.keepLocked' : 'common.close'"
          data-testid="accessClose"
          @click="close"
        />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AccountAccessIssue } from '@extension-base/background/types/types';
import ValidatedInput from '@/components/ValidatedInput.vue';
import { getAccessStatus, recoverAccountWithPassword, recoverAccountWithPhrase } from '@/extension/messaging';
import { isSameString } from '@/helpers';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

type AccessRow = AccountAccessIssue & {
  usePhrase: boolean;
  secret: string;
  isBusy: boolean;
  errorKey: string;
};

const props = defineProps<{
  /** Opened from a failed send or export: that account's rows come first and alone. */
  address?: string;
}>();

const RESULT_ERROR_KEYS: Record<string, string> = {
  wrong_password: 'accountAccess.wrongPassword',
  phrase_mismatch: 'accountAccess.phraseMismatch',
};

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const accountsStore = useAccountsStore();

const rows = ref<AccessRow[]>([]);
const isLoading = ref(true);
const loadFailed = ref(false);

const matchesScope = (issue: AccountAccessIssue): boolean =>
  !!props.address &&
  (isSameString(issue.address, props.address) || isSameString(issue.linkedParentAddress, props.address));

// Rows keep what the user typed while the list refreshes after another account was unlocked.
function showIssues(issues: AccountAccessIssue[]): void {
  const scoped = issues.filter(matchesScope);

  rows.value = (scoped.length ? scoped : issues).map(
    (issue) =>
      rows.value.find(({ address }) => address === issue.address) ?? {
        ...issue,
        usePhrase: false,
        secret: '',
        isBusy: false,
        errorKey: '',
      }
  );
}

async function load(): Promise<void> {
  loadFailed.value = false;

  try {
    showIssues((await getAccessStatus()).issues);
  } catch {
    loadFailed.value = true;
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

function rowName(row: AccessRow): string {
  if (!row.linkedParentAddress) return row.name || row.address;

  const parent = accountsStore.accounts.find(({ address }) => address === row.linkedParentAddress);

  return t('accountAccess.evmAccountOf', { name: parent?.name || row.name || row.linkedParentAddress });
}

const hintKey = (row: AccessRow): string =>
  row.kind === 'legacy_account_password' ? 'accountAccess.legacyPasswordHint' : 'accountAccess.previousPasswordHint';

function setSecret(row: AccessRow, value: string): void {
  row.secret = value;
  row.errorKey = '';
}

function toggleMode(row: AccessRow): void {
  row.usePhrase = !row.usePhrase;
  row.secret = '';
  row.errorKey = '';
}

// Nothing is written unless the password opens this key, or the phrase reproduces this account.
async function unlock(row: AccessRow): Promise<void> {
  if (row.isBusy || !row.secret.trim()) return;

  row.isBusy = true;
  row.errorKey = '';

  try {
    const { address, walletEcosystem } = row;
    const result = row.usePhrase
      ? await recoverAccountWithPhrase({ address, walletEcosystem, phrase: row.secret })
      : await recoverAccountWithPassword({ address, walletEcosystem, password: row.secret });

    if (!result.ok) {
      row.errorKey = RESULT_ERROR_KEYS[result.code ?? ''] ?? 'accountAccess.unlockFailed';

      return;
    }

    notify({ title: t('accountAccess.unlocked', { name: rowName(row) }), message: '', type: 'success' });
    rows.value = rows.value.filter((candidate) => candidate !== row);
    await load();
  } catch {
    row.errorKey = 'accountAccess.unlockFailed';
  } finally {
    row.isBusy = false;
  }
}

// Back to the send or export that sent the user here; Settings when opened on its own.
function close(): void {
  if (window.history.state?.back) router.go(-1);
  else router.push({ name: Components.Settings });
}
</script>

<style lang="scss" scoped>
.account-access {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}

.account-access__rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-access__explain,
.account-access__notice {
  margin: 0;
  color: $grayish-white;
  font-size: 0.8rem;
  line-height: 1.4;
}

.account-access__notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: $default-border;
  border-radius: $default-border-radius;
}

.access-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: $default-border;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
}

.access-row__name {
  overflow-wrap: anywhere;
}

.access-row__address {
  color: $gray-color;
  font-family: monospace;
  font-size: 0.68rem;
  overflow-wrap: anywhere;
}

.access-row__hint {
  color: $grayish-white;
  font-size: 0.75rem;
  line-height: 1.35;
}

.access-row__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.access-row__switch {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}
</style>
