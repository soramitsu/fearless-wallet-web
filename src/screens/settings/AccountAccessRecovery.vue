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

            <!-- An account derived with a path needs it next to the phrase to give the same address. -->
            <ValidatedInput
              v-if="row.usePhrase && acceptsDerivationPath(row)"
              :value="row.derivationPath"
              type="text"
              :maxlength="200"
              placeholder="accountAccess.derivationPathPlaceholder"
              data-testid="accessDerivationPath"
              @change="setDerivationPath(row, $event)"
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

            <button
              v-if="row.canDownloadEncryptedBackup"
              type="button"
              class="access-row__switch"
              data-testid="accessDownloadBackup"
              @click="downloadBackup(row)"
            >
              {{ t('migration.downloadBackup') }}
            </button>
          </section>

          <!-- Deleting a wallet keeps its keys on this device; it comes back here exactly as it was. -->
          <template v-if="!isLoading && deletedWallets.length">
            <h2 class="account-access__subtitle" data-testid="deletedWalletsTitle">{{ t('accountAccess.deletedTitle') }}</h2>

            <section
              v-for="wallet in deletedWallets"
              :key="wallet.id"
              class="access-row"
              data-testid="deletedWallet"
              :data-address="wallet.address"
            >
              <strong class="access-row__name">{{ wallet.name || wallet.address }}</strong>
              <span class="access-row__address">{{ wallet.address }}</span>
              <span class="access-row__hint">{{ t('accountAccess.deletedHint', { date: formatDate(wallet.deletedAt) }) }}</span>
              <span v-if="restoreErrors[wallet.id]" class="access-row__error" role="alert" data-testid="deletedWalletError">
                {{ t(restoreErrors[wallet.id]) }}
              </span>

              <div class="access-row__actions">
                <FButton
                  text="accountAccess.restore"
                  size="small"
                  fontSize="small"
                  :disabled="!!restoring"
                  data-testid="deletedWalletRestore"
                  @click="restore(wallet)"
                />
              </div>
            </section>
          </template>
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
import type { AccountAccessIssue, DeletedWalletSummary } from '@extension-base/background/types/types';
import ValidatedInput from '@/components/ValidatedInput.vue';
import {
  getAccessStatus,
  getDeletedWallets,
  migrateExportJSON,
  recoverAccountWithPassword,
  recoverAccountWithPhrase,
  restoreDeletedWallet,
} from '@/extension/messaging';
import { isSameString } from '@/helpers';
import { downloadJsonAccount } from '@/helpers/files';
import { WalletEcosystem } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

type AccessRow = AccountAccessIssue & {
  usePhrase: boolean;
  secret: string;
  derivationPath: string;
  isBusy: boolean;
  errorKey: string;
};

const props = defineProps<{
  /** Opened from a failed send or export: that account's rows come first and alone. */
  address?: string;
  /** 'phrase' when opened from "Forgot this password? Use the recovery phrase". */
  mode?: string;
}>();

const RESULT_ERROR_KEYS: Record<string, string> = {
  wrong_password: 'accountAccess.wrongPassword',
  previous_password_required: 'accountAccess.previousPasswordRequired',
  phrase_mismatch: 'accountAccess.phraseMismatch',
};

const router = useRouter();
const notify = useNotify();
const { t, locale } = useI18n();
const accountsStore = useAccountsStore();

const rows = ref<AccessRow[]>([]);
const isLoading = ref(true);
const loadFailed = ref(false);
const deletedWallets = ref<DeletedWalletSummary[]>([]);
const restoring = ref('');
const restoreErrors = ref<Record<string, string>>({});

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
        usePhrase: props.mode === 'phrase' && matchesScope(issue),
        secret: '',
        derivationPath: '',
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

  await loadDeletedWallets();
}

// Opened from a failed send or export, the screen is about that account only. The list never holds up unlocking.
async function loadDeletedWallets(): Promise<void> {
  if (props.address) return;

  try {
    deletedWallets.value = await getDeletedWallets();
  } catch (error) {
    console.error(error);
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

// A TON phrase is checked against the stored public key as it is; only keyring accounts take a path.
const acceptsDerivationPath = (row: AccessRow): boolean => row.walletEcosystem !== WalletEcosystem.Ton;

function setSecret(row: AccessRow, value: string): void {
  row.secret = value;
  row.errorKey = '';
}

function setDerivationPath(row: AccessRow, value: string): void {
  row.derivationPath = value;
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
    const derivationPath = acceptsDerivationPath(row) ? row.derivationPath.trim() : '';
    const result = row.usePhrase
      ? await recoverAccountWithPhrase({
          address,
          walletEcosystem,
          phrase: row.secret,
          ...(derivationPath ? { derivationPath } : {}),
        })
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

// The stored record as it is: it still opens only with the account's old password, so nothing changes.
async function downloadBackup(row: AccessRow): Promise<void> {
  try {
    const { json } = await migrateExportJSON(row.address);

    downloadJsonAccount(row.address, json);
  } catch {
    notify({ title: t('migration.downloadBackupFailed'), message: '', type: 'error' });
  }
}

function formatDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(String(locale?.value ?? 'en'), { dateStyle: 'medium' }).format(timestamp);
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

// The wallet's records go back where they were; a record stored there since is never written over.
async function restore(wallet: DeletedWalletSummary): Promise<void> {
  if (restoring.value) return;

  restoring.value = wallet.id;
  restoreErrors.value = { ...restoreErrors.value, [wallet.id]: '' };

  try {
    const result = await restoreDeletedWallet(wallet.id);

    if (!result.ok) {
      restoreErrors.value = {
        ...restoreErrors.value,
        [wallet.id]: result.code === 'already_in_wallet' ? 'accountAccess.alreadyRestored' : 'accountAccess.restoreFailed',
      };

      return;
    }

    notify({ title: t('accountAccess.restored', { name: wallet.name || wallet.address }), message: '', type: 'success' });
    deletedWallets.value = deletedWallets.value.filter(({ id }) => id !== wallet.id);
  } catch {
    restoreErrors.value = { ...restoreErrors.value, [wallet.id]: 'accountAccess.restoreFailed' };
  } finally {
    restoring.value = '';
  }
}

// Back to the send, export or password prompt that sent the user here; Settings when opened on its own.
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

.access-row__error {
  color: $reject-color;
  font-size: 0.75rem;
  line-height: 1.35;
}

.account-access__subtitle {
  margin: 8px 0 0;
  font-size: 0.9rem;
  font-weight: 700;
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
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}
</style>
