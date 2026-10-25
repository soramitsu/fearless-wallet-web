<template>
  <Popup headerText="walletDetailsPopup.deleteWallet" :zIndex="399" @handlerClose="cancel">
    <div class="delete-wallet" data-testid="deleteWalletConfirmation">
      <p class="delete-wallet__title" data-testid="deleteWalletTitle">{{ t('deleteWallet.title', { name }) }}</p>

      <!-- The full balance, hidden assets included, so nobody deletes a wallet they believe is empty. -->
      <div class="delete-wallet__balance" data-testid="deleteWalletBalance">
        <span class="delete-wallet__label">{{ t('deleteWallet.balance') }}</span>
        <WalletBalance :balance="total?.total ?? 0" :caption="caption" :loading="!isTotalLoaded" :staticWidth="false" />
      </div>

      <p class="delete-wallet__text">{{ t(isMobile ? 'deleteWallet.mobileDescription' : 'deleteWallet.description') }}</p>
      <p v-if="!isMobile" class="delete-wallet__text" data-testid="deleteWalletArchived">{{ t('deleteWallet.archived') }}</p>

      <FButton
        v-if="!isMobile"
        text="deleteWallet.exportFirst"
        type="secondary"
        width="100%"
        size="small"
        fontSize="small"
        data-testid="deleteWalletExport"
        @click="exportFirst"
      />

      <template v-if="!isMobile">
        <span class="delete-wallet__hint">{{ t('deleteWallet.passwordHint') }}</span>

        <ValidatedInput
          :value="password"
          placeholder="accounts.passwordApp"
          errorDescriptions="common.invalidPassword"
          :isError="isWrongPassword"
          :showPassword="true"
          :maxlength="200"
          data-testid="deleteWalletPassword"
          @change="setPassword"
          @pressEnter="confirm"
        />
      </template>

      <p v-if="failed" class="delete-wallet__error" role="alert" data-testid="deleteWalletFailed">{{ t('deleteWallet.failed') }}</p>

      <div class="delete-wallet__actions">
        <FButton
          text="common.cancel"
          type="secondary"
          size="small"
          fontSize="small"
          data-testid="deleteWalletCancel"
          @click="cancel"
        />
        <FButton
          text="walletDetailsPopup.deleteWallet"
          type="warning"
          size="small"
          fontSize="small"
          :disabled="isBusy || (!isMobile && !password)"
          data-testid="deleteWalletConfirm"
          @click="confirm"
        />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ResponseTotalBalances } from '@extension-base/background/types/types';
import ValidatedInput from '@/components/ValidatedInput.vue';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import { fetchWalletTotals, walletBalanceCaption } from '@/screens/main/walletTotals';
import { forgetAccount, updateCurrentAccount, validatePassword } from '@/extension/messaging';
import { POLKADOT, TON_MAINNET } from '@/consts/networks';
import { WalletEcosystem } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{ address: string }>();

const emit = defineEmits<{ (event: 'cancel'): void; (event: 'deleted'): void; (event: 'exported'): void }>();

const { t } = useI18n();
const router = useRouter();
const accountsStore = useAccountsStore();

const account = computed(() => accountsStore.accounts.find(({ address }) => address === props.address));
const name = computed(() => account.value?.name || props.address);
// A wallet added from the mobile app keeps its keys there; this browser has only its address.
const isMobile = computed(() => !!account.value?.isMobile);

const total = ref<ResponseTotalBalances>();
const isTotalLoaded = ref(false);
const caption = computed(() => walletBalanceCaption(total.value, t));

const password = ref('');
const isWrongPassword = ref(false);
const isBusy = ref(false);
const failed = ref(false);

onMounted(async () => {
  try {
    total.value = (await fetchWalletTotals(props.address)).find(({ address }) => address === props.address);
  } catch {
    // The confirmation still works; the amount stays as the wallet list shows it.
  } finally {
    isTotalLoaded.value = true;
  }
});

function setPassword(value: string): void {
  password.value = value;
  isWrongPassword.value = false;
}

function cancel(): void {
  emit('cancel');
}

// The export screens work on the selected wallet, so this one is selected first.
async function exportFirst(): Promise<void> {
  const walletEcosystem = account.value?.walletEcosystem ?? WalletEcosystem.Substrate;

  if (account.value) accountsStore.setSelectedWallet(account.value);

  await updateCurrentAccount(props.address, walletEcosystem);

  router.push({ name: Components.Export, params: { network: walletEcosystem === WalletEcosystem.Ton ? TON_MAINNET : POLKADOT } });
  emit('exported');
}

// Nothing is deleted without the password; the background keeps the keys for Account access before it removes them.
async function confirm(): Promise<void> {
  if (isBusy.value || (!isMobile.value && !password.value)) return;

  isBusy.value = true;
  failed.value = false;

  try {
    if (!isMobile.value && !(await validatePassword(password.value))) {
      isWrongPassword.value = true;

      return;
    }

    if (!(await forgetAccount(props.address, isMobile.value ? 'mobile' : 'native'))) {
      failed.value = true;

      return;
    }

    emit('deleted');
  } catch {
    failed.value = true;
  } finally {
    isBusy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.delete-wallet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 $default-padding $default-padding;
  text-align: left;

  &__title {
    margin: 0;
    font-weight: 700;
    font-size: 1.125em;
    overflow-wrap: anywhere;
  }

  &__balance {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border: $default-border;
    border-radius: $default-border-radius;
    background: $secondary-background-color;
  }

  &__label,
  &__hint,
  &__text {
    margin: 0;
    color: $grayish-white;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  &__error {
    margin: 0;
    color: $reject-color;
    font-size: 0.8rem;
  }

  &__actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
}
</style>
