<template>
  <AboveForm :fullScreen="true" header="exposureNotice.guide.title" @closeHandler="leave">
    <div class="exposure-guide" data-testid="securityNoticeGuide">
      <p class="exposure-guide__text">{{ t('exposureNotice.guide.intro') }}</p>
      <p v-if="status?.importedWallets?.length" class="exposure-guide__text" data-testid="securityNoticeImportedExplanation">
        {{ t('exposureNotice.importedReminder') }}
      </p>

      <ol class="exposure-guide__steps">
        <li class="exposure-guide__step" :class="{ 'exposure-guide__step--done': newMainWallets.length > 0 }">
          <h2 class="exposure-guide__step-title">{{ t('exposureNotice.guide.createTitle') }}</h2>
          <p class="exposure-guide__text">{{ t(status?.wallets.length ? 'exposureNotice.guide.createText' : 'exposureNotice.guide.createImportedText') }}</p>

          <div v-if="newWallets.length" class="exposure-guide__new-wallets" data-testid="securityNoticeNewWallets">
            <span class="exposure-guide__label">{{ t('exposureNotice.guide.newWallets') }}</span>
            <ul class="exposure-guide__list">
              <li v-for="wallet in newWallets" :key="wallet.address" class="exposure-guide__new-wallet">
                <span class="exposure-guide__name">{{ wallet.name || cut(wallet.address) }}</span>
                <span class="exposure-guide__address">{{ cut(wallet.address) }}</span>
              </li>
            </ul>
          </div>

          <FButton
            text="addWallet.createWallet"
            :type="newMainWallets.length ? 'secondary' : 'primary'"
            :border="false"
            data-testid="securityNoticeCreateWallet"
            @click="createWallet(WalletEcosystem.Substrate)"
          />

          <template v-if="hasOldTonWallet">
            <p class="exposure-guide__text">{{ t('exposureNotice.guide.createTonText') }}</p>
            <FButton
              text="exposureNotice.guide.createTonButton"
              :type="newTonWallets.length ? 'secondary' : 'primary'"
              :border="false"
              data-testid="securityNoticeCreateTonWallet"
              @click="createWallet(WalletEcosystem.Ton)"
            />
          </template>
        </li>

        <li class="exposure-guide__step" :class="{ 'exposure-guide__step--done': backupConfirmed }">
          <h2 class="exposure-guide__step-title">{{ t('exposureNotice.guide.backupTitle') }}</h2>
          <p class="exposure-guide__text">{{ t('exposureNotice.guide.backupText') }}</p>

          <Checkbox
            v-if="newWallets.length"
            :label="t('exposureNotice.guide.backupConfirm')"
            :value="backupConfirmed"
            data-testid="securityNoticeBackupConfirm"
            @change="setBackupConfirmed"
          />
        </li>

        <li class="exposure-guide__step" :class="{ 'exposure-guide__step--done': allMoved }">
          <h2 class="exposure-guide__step-title">{{ t('exposureNotice.guide.moveTitle') }}</h2>
          <p class="exposure-guide__text">{{ t('exposureNotice.guide.moveText') }}</p>
          <p class="exposure-guide__text">{{ t('exposureNotice.guide.moveNotListed') }}</p>
          <a
            class="exposure-guide__link"
            data-testid="securityNoticeMigration"
            aria-describedby="security-notice-migration-limitation"
            :href="URLS.POLKASWAP_MIGRATION"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('exposureNotice.guide.migrateLink') }}</a>
          <p
            id="security-notice-migration-limitation"
            class="exposure-guide__hint"
            data-testid="securityNoticeMigrationLimitation"
          >{{ t('exposureNotice.guide.migrateLimitation') }}</p>

          <p class="exposure-guide__progress" role="status" data-testid="securityNoticeProgress">
            {{
              allMoved
                ? t('exposureNotice.guide.allMoved')
                : tc('exposureNotice.guide.remaining', stillToMove.length, { count: stillToMove.length })
            }}
          </p>

          <p v-if="!newMainWallets.length" class="exposure-guide__hint" data-testid="securityNoticeNoDestination">
            {{ t('exposureNotice.guide.noDestination') }}
          </p>

          <div
            v-else-if="newMainWallets.length > 1"
            class="exposure-guide__destinations"
            role="radiogroup"
            :aria-label="t('exposureNotice.guide.sendTo')"
          >
            <span class="exposure-guide__label">{{ t('exposureNotice.guide.sendTo') }}</span>
            <button
              v-for="wallet in newMainWallets"
              :key="wallet.address"
              type="button"
              role="radio"
              class="exposure-guide__destination"
              :class="{ 'exposure-guide__destination--active': wallet.address === destination }"
              :aria-checked="wallet.address === destination"
              data-testid="securityNoticeDestination"
              @click="chosenDestination = wallet.address"
            >
              {{ wallet.name || cut(wallet.address) }}
            </button>
          </div>

          <ul class="exposure-guide__list">
            <li
              v-for="wallet in oldWallets"
              :key="wallet.address"
              class="exposure-guide__old-wallet"
              :class="{ 'exposure-guide__old-wallet--open': isOpen(wallet) }"
              data-testid="securityNoticeOldWallet"
            >
              <div class="exposure-guide__old-wallet-header">
                <span class="exposure-guide__name">{{ wallet.name || cut(wallet.address) }}</span>
                <span class="exposure-guide__address">{{ cut(wallet.address) }}</span>
                <span class="exposure-guide__status" :class="statusClass(wallet)" data-testid="securityNoticeWalletStatus">
                  {{ t(statusText(wallet)) }}
                </span>
              </div>

              <p v-if="!wallet.present" class="exposure-guide__hint">{{ t('exposureNotice.walletRemovedHint') }}</p>

              <template v-else>
                <div v-if="isOpen(wallet)" class="exposure-guide__remaining">
                  <h3 class="exposure-guide__label">{{ t('exposureNotice.guide.remainingTitle') }}</h3>

                  <p v-if="accountsStore.isBalanceLoading" class="exposure-guide__hint">
                    {{ t('exposureNotice.guide.checking') }}
                  </p>

                  <ul v-else-if="balances.length" class="exposure-guide__list" data-testid="securityNoticeBalances">
                    <li v-for="row in balances" :key="`${row.groupId}:${row.network}`" class="exposure-guide__balance">
                      <span class="exposure-guide__balance-amount">{{ n(Number(row.amount), 'decimal') }} {{ row.symbol }}</span>
                      <span class="exposure-guide__balance-network">{{ networkName(row.network) }}</span>
                      <FButton
                        class="exposure-guide__balance-send"
                        text="assets.sendButtonText"
                        size="small"
                        data-testid="securityNoticeSend"
                        @click="send(row, wallet)"
                      />
                    </li>
                  </ul>

                  <p
                    v-else-if="!balancesUnchecked"
                    class="exposure-guide__hint"
                    data-testid="securityNoticeNothingFound"
                  >
                    {{ t('exposureNotice.guide.nothingFound') }}
                  </p>

                  <p
                    v-if="!accountsStore.isBalanceLoading && balanceIssue"
                    class="exposure-guide__hint exposure-guide__hint--issue"
                    data-testid="securityNoticeBalanceIssue"
                  >
                    {{ t(balanceIssue) }}
                  </p>
                </div>

                <div class="exposure-guide__old-wallet-actions">
                  <FButton
                    v-if="!isOpen(wallet)"
                    text="exposureNotice.guide.open"
                    size="small"
                    type="secondary"
                    :border="false"
                    :disabled="!!opening"
                    data-testid="securityNoticeOpenWallet"
                    @click="openWallet(wallet)"
                  />
                  <FButton
                    :text="wallet.movedAt ? 'exposureNotice.guide.undoMoved' : 'exposureNotice.guide.markMoved'"
                    size="small"
                    type="secondary"
                    :border="false"
                    :disabled="busy"
                    data-testid="securityNoticeMarkMoved"
                    @click="setMoved(wallet, !wallet.movedAt)"
                  />
                </div>
              </template>
            </li>
          </ul>
        </li>
      </ol>

      <p v-if="failed" class="exposure-guide__error" role="alert" data-testid="securityNoticeGuideError">
        {{ t('exposureNotice.acknowledgeFailed') }}
      </p>

      <div class="exposure-guide__controls">
        <FButton
          v-if="status?.state === 'acknowledged'"
          text="exposureNotice.readNotice"
          type="secondary"
          :border="false"
          size="big"
          data-testid="securityNoticeReadNotice"
          @click="readNotice"
        />
        <FButton text="exposureNotice.guide.later" size="big" data-testid="securityNoticeLater" @click="leave" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  LegacyExposureStatus,
  LegacyExposureWallet,
  RequestUpdateLegacyExposure,
} from '@extension-base/services/legacy-exposure-service';
import AboveForm from '@/components/AboveForm.vue';
import Checkbox from '@/components/Checkbox.vue';
import FButton from '@/components/FButton.vue';
import { hasMasterPassword, updateCurrentAccount } from '@/extension/messaging';
import { getLegacyExposureStatus, updateLegacyExposure } from '@/extension/messaging/legacy-exposure';
import { URLS } from '@/consts/urls';
import { cut } from '@/helpers';
import { WalletEcosystem } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';
import { formatNetworkSyncFreshness } from '@/portfolio/syncFreshness';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { type LegacyExposureBalance, remainingBalances, sameWalletAddress, walletsStillToMove, walletsToReview } from '@/util/legacyExposure';

const route = useRoute();
const router = useRouter();
const { t, tc, n } = useI18n();
const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();

const status = ref<LegacyExposureStatus>();
const busy = ref(false);
const failed = ref(false);
const opening = ref('');
const chosenDestination = ref('');

const oldWallets = computed(() => walletsToReview(status.value));
const newWallets = computed(() => status.value?.newWallets ?? []);
const newMainWallets = computed(() =>
  newWallets.value.filter(({ walletEcosystem }) => walletEcosystem !== WalletEcosystem.Ton)
);
const newTonWallets = computed(() =>
  newWallets.value.filter(({ walletEcosystem }) => walletEcosystem === WalletEcosystem.Ton)
);
const hasOldTonWallet = computed(() =>
  oldWallets.value.some(({ walletEcosystem }) => walletEcosystem === WalletEcosystem.Ton)
);
const backupConfirmed = computed(() => !!status.value?.backupConfirmedAt);
const stillToMove = computed(() => walletsStillToMove(status.value));
const allMoved = computed(() => !!status.value && stillToMove.value.length === 0);

// The first new wallet unless the user picked another one.
const destination = computed(
  () =>
    newMainWallets.value.find(({ address }) => address === chosenDestination.value)?.address ??
    newMainWallets.value[0]?.address ??
    ''
);

// The worst sync state of the open wallet. An empty list is never read as "nothing left" while a
// network could not be checked, or before any balance arrived at all (offline, or still starting).
const BALANCE_ISSUES = [
  'portfolioPage.balanceStatus.failed',
  'portfolioPage.balanceStatus.notLoaded',
  'portfolioPage.balanceStatus.outdated',
];
const balanceIssue = computed(() => {
  const items = accountsStore.balances.flatMap(({ balances }) => balances);
  const found = Object.values(accountsStore.networkScanStates ?? {}).map((state) =>
    formatNetworkSyncFreshness(state, { translate: (key) => key })
  );

  if (items.some(({ state }) => state === 'error')) found.push(BALANCE_ISSUES[0]);
  if (!items.length || items.some(({ state }) => state === 'pending')) found.push(BALANCE_ISSUES[1]);

  return BALANCE_ISSUES.find((key) => found.includes(key)) ?? '';
});
const balancesUnchecked = computed(() => BALANCE_ISSUES.slice(0, 2).includes(balanceIssue.value));

// Balances are those of the wallet selected in the app, so only that old wallet lists them.
const balances = computed(() =>
  remainingBalances(accountsStore.balances, (name) => {
    const network = networksStore.getNetwork(name);

    return !!network && isTestnetNetwork(network);
  })
);

const isOpen = (wallet: LegacyExposureWallet) =>
  wallet.present && sameWalletAddress(wallet.address, accountsStore.selectedWallet.address);

const statusText = (wallet: LegacyExposureWallet) => {
  if (!wallet.present) return 'exposureNotice.walletRemoved';

  return wallet.movedAt ? 'exposureNotice.guide.statusMoved' : 'exposureNotice.guide.statusPending';
};

const statusClass = (wallet: LegacyExposureWallet) => ({
  'exposure-guide__status--moved': wallet.present && !!wallet.movedAt,
  'exposure-guide__status--removed': !wallet.present,
});

const networkName = (name: string) => networksStore.getNetwork(name)?.name ?? name;

// Where the user was going when the notice stopped them.
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : undefined));

async function refresh(): Promise<void> {
  try {
    status.value = await getLegacyExposureStatus();
  } catch {
    failed.value = true;
  }
}

onMounted(refresh);

async function update(request: RequestUpdateLegacyExposure): Promise<void> {
  if (busy.value) return;

  busy.value = true;
  failed.value = false;

  try {
    status.value = await updateLegacyExposure(request);
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}

const setBackupConfirmed = (value: boolean) => update({ backupConfirmed: value });

const setMoved = (wallet: LegacyExposureWallet, moved: boolean) => update({ moved: { address: wallet.address, moved } });

async function createWallet(walletEcosystem: WalletEcosystem): Promise<void> {
  // A profile whose only trace of 3.0.x is a TON wallet kept through a reset has no password yet.
  if (!(await hasMasterPassword())) {
    await router.push({ name: Components.ChangePassword, params: { name: Components.AddWallet, type: 'create', walletEcosystem } });

    return;
  }

  await router.push({ name: Components.AddWallet, params: { type: 'create', walletEcosystem } });
}

async function openWallet(wallet: LegacyExposureWallet): Promise<void> {
  const account = accountsStore.accounts.find(({ address }) => sameWalletAddress(address, wallet.address));

  if (!account || opening.value) return;

  opening.value = wallet.address;

  try {
    await updateCurrentAccount(account.address, account.walletEcosystem ?? WalletEcosystem.Substrate);
  } catch {
    failed.value = true;
  } finally {
    opening.value = '';
  }
}

function send(row: LegacyExposureBalance, wallet: LegacyExposureWallet): void {
  const to = wallet.walletEcosystem === WalletEcosystem.Ton ? newTonWallets.value[0]?.address : destination.value;

  router.push({
    name: Components.SendForm,
    params: { assetId: row.groupId, network: row.network },
    ...(to ? { query: { to } } : {}),
  });
}

const readNotice = () => router.push({ name: Components.SecurityNotice });

const leave = () => router.replace(redirect.value ?? { name: Components.Wallet });
</script>

<style lang="scss" scoped>
.exposure-guide {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
  height: 100%;
  margin: 0 auto;
  padding-bottom: $default-padding;
  overflow-y: auto;
  text-align: left;

  &__text {
    margin: 0;
    color: $grayish-white;
    line-height: 1.5;
  }

  // The same Polkaswap request the security popup links to, for a SORA account; it opens in a new tab.
  &__link {
    align-self: flex-start;
    color: $pink-lavender-color;
    font-weight: 600;
    line-height: 1.5;

    &:focus-visible {
      outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
      outline-offset: 2px;
    }
  }

  &__steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  &__step {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 14px 14px 56px;
    border: $default-border;
    border-radius: $default-border-radius;
    background-color: $secondary-background-color;
    counter-increment: step;

    &::before {
      content: counter(step);
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: $default-background-color;
      color: $pink-color;
      font-weight: 700;
    }

    &--done::before {
      content: '✓';
      color: $success-color;
    }
  }

  &__step-title {
    margin: 0;
    color: $default-white;
    font-size: 1rem;
    font-weight: 700;
  }

  &__label {
    display: block;
    margin: 0 0 6px;
    color: $default-white;
    font-size: 0.8125rem;
    font-weight: 700;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__new-wallet,
  &__old-wallet-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }

  &__name {
    min-width: 0;
    overflow: hidden;
    color: $default-white;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__address,
  &__hint {
    margin: 0;
    color: $grayish-white;
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  &__hint--issue {
    color: $simple-orange-color;
  }

  &__progress {
    margin: 0;
    color: $default-white;
    font-weight: 700;
  }

  &__destinations {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  &__destination {
    padding: 4px 10px;
    border: 1px solid palette($default-background-color, var(--fw-stroke-control));
    border-radius: 999px;
    background: transparent;
    color: $grayish-white;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;

    &--active {
      border-color: $pink-color;
      color: $plain-white;
    }

    &:focus-visible {
      outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
      outline-offset: 2px;
    }
  }

  &__old-wallet {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: $default-border;
    border-radius: $default-border-radius;

    &--open {
      border-color: $pink-color;
    }
  }

  &__status {
    margin-left: auto;
    color: $simple-orange-color;
    font-size: 0.75rem;

    &--moved {
      color: $success-color;
    }

    &--removed {
      color: $grayish-white;
    }
  }

  &__remaining {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__balance {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'amount action'
      'network action';
    align-items: center;
    column-gap: 10px;
  }

  &__balance-amount {
    grid-area: amount;
    color: $default-white;
    overflow-wrap: anywhere;
  }

  &__balance-network {
    grid-area: network;
    color: $grayish-white;
    font-size: 0.8125rem;
  }

  &__balance-send {
    grid-area: action;
  }

  &__old-wallet-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__error {
    margin: 0;
    color: palette($pink-color, var(--fw-danger));
    font-size: 0.8125rem;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
